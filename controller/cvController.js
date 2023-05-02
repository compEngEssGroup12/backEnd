const dotenv = require("dotenv");
dotenv.config();

const https = require("https");
const url = require("url");
const querystring = require("querystring");
const {data} = require("express-session/session/cookie");

const redirect_uri = `http://${process.env.BACK_ADDRESS}/courseville/access_token`;
const authorization_url = `https://www.mycourseville.com/api/oauth/authorize?response_type=code&client_id=${process.env.CLIENT_ID}&redirect_uri=${redirect_uri}`;
const access_token_url = "https://www.mycourseville.com/api/oauth/access_token";

const {v4: uuidv4} = require("uuid");
const {DynamoDBClient} = require("@aws-sdk/client-dynamodb");
const {PutCommand, DeleteCommand, ScanCommand} = require("@aws-sdk/lib-dynamodb");

const docClient = new DynamoDBClient({region: process.env.AWS_REGION});

exports.getInfo = (req, res) => {
  try {
    let userData = makeUserData();

    const requestOptions = {
      headers: {
        Authorization: `Bearer ${req.session.token.access_token}`,
      },
    };

    makeRequest(
      "https://www.mycourseville.com/api/v1/public/get/user/info",
      requestOptions
    )
      .then((payload) => {
        const data = JSON.parse(payload);
        userData.student_id = data.data.student.id;
        userData.firstname_en = data.data.student.firstname_en;
        userData.lastname_en = data.data.student.lastname_en;
        return makeRequest(
          "https://www.mycourseville.com/api/v1/public/get/user/courses?detail=1",
          requestOptions
        )
      })
      .then((payload) => {
        const data = JSON.parse(payload);
        data.data.student.sort((b, a) => {
          let y = parseInt(a.year) - parseInt(b.year);
          if (y !== 0) return y;
          let z = a.semester - b.semester;
          if (z !== 0) return z;
          return a.course_no.localeCompare(b.course_no);
        });
        let promises = []
        data.data.student.forEach((value) => {
          if (parseInt(value.year) >= 2022 && value.semester) {
            const course = makeCourseData(
              value.cv_cid,
              value.course_no,
              value.title
            )
            promises.push(
              makeRequest(
                `https://www.mycourseville.com/api/v1/public/get/course/assignments?cv_cid=${value.cv_cid}&detail=1&published=published`,
                requestOptions
              )
            )
            userData.courses.push(course);
          }
        });
        return promises
      })
      .then((promises) => {
        Promise.all(
          promises.map((promise, index) => {
            return promise.then((payload) => {
              const data = JSON.parse(payload);
              for (const assignment of data.data) {
                userData.courses[index].assignments.push(
                  makeAssignmentData(
                    assignment.itemid,
                    assignment.title,
                    assignment.duetime,
                    0
                  )
                );
              }
            });
          })
        )
          .then(() => {
            const scanParams = {
              TableName: process.env.AWS_TABLE_NAME
            };
            return docClient.send(new ScanCommand(scanParams));
          })
          .then((tableData) => {
            const items = tableData.Items;
            for (const item of items) {
              if (item.student_id === userData.student_id) {
                userData.courses.forEach((course, i) => {
                  course.assignments.forEach((assignment, j) => {
                    for (const item_id of item.item_ids)
                      if (assignment.item_id === item_id)
                        userData.courses[i].assignments[j].state = 1;
                  })
                });
                break;
              }
            }
          })
          .then(() => res.json(userData));
      })
      .catch((err) => {
          console.error(err);
        }
      )
  } catch (error) {
    console.log(error);
    console.log("Please logout, then login again.");
  }
};

exports.authApp = (req, res) => {
  res.redirect(authorization_url);
};

exports.accessToken = (req, res) => {
  const parsedUrl = url.parse(req.url);
  const parsedQuery = querystring.parse(parsedUrl.query);

  if (parsedQuery.error) {
    res.writeHead(400, {"Content-Type": "text/plain"});
    res.end(`Authorization error: ${parsedQuery.error_description}`);
    return;
  }

  if (parsedQuery.code) {
    const postData = querystring.stringify({
      grant_type: "authorization_code",
      code: parsedQuery.code,
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      redirect_uri: redirect_uri,
    });

    const tokenOptions = {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": postData.length,
      },
    };

    const tokenReq = https.request(
      access_token_url,
      tokenOptions,
      (tokenRes) => {
        let tokenData = "";
        tokenRes.on("data", (chunk) => {
          tokenData += chunk;
        });
        tokenRes.on("end", () => {
          const token = JSON.parse(tokenData);
          req.session.token = token;
          req.session.save(() => {
            console.log(req.session);
          });
          if (token) {
            res.writeHead(302, {
              Location: `http://${process.env.FRONT_ADDRESS}?status=ok`,
            });
            res.end();
          }
        });
      }
    );

    tokenReq.on("error", (err) => {
      console.error(err);
    });

    tokenReq.write(postData);
    tokenReq.end();

  } else {
    res.writeHead(302, {Location: authorization_url});
    res.end();
  }
};

exports.logout = (req, res) => {
  req.session.destroy();
  res.redirect(`http://${process.env.FRONT_ADDRESS}`);
  res.end();
};

exports.scanTable = getTable;

async function getTable(req, res) {
  const scanParams = {
    TableName: process.env.AWS_TABLE_NAME
  };
  try {
    const tableData = await docClient.send(new ScanCommand(scanParams));
    res.send(tableData.Items);
  } catch (err) {
    console.error(err);
    res.status(400).end();
  }
}

exports.postTable = putTable;

async function putTable(req, res) {
  console.log(req.body);
  const item = {...req.body};
  const deleteParams = {
    TableName: process.env.AWS_TABLE_NAME,
    Key: {
      student_id: item.student_id,
    },
  };
  const putParams = {
    Item: item,
    TableName: process.env.AWS_TABLE_NAME,
  };
  try {
    await docClient.send(new DeleteCommand(deleteParams));
    await docClient.send(new PutCommand(putParams));
    console.log(item);
    res.status(200).end();
  } catch (err) {
    console.error(err);
    res.status(400).end();
  }
}

function makeRequest(url, options) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, res => {
      let data = '';
      res.on('data', chunk => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function makeUserData(student_id = undefined,
                      firstname_en = undefined,
                      lastname_en = undefined,
                      courses = []) {
  return {
    "student_id": student_id,
    "firstname_en": firstname_en,
    "lastname_en": lastname_en,
    "courses": courses
  };
}

function makeCourseData(cv_cid = undefined,
                        course_no = undefined,
                        title = undefined,
                        assignments = []) {
  return {
    "cv_cid": cv_cid,
    "course_no": course_no,
    "title": title,
    "assignments": assignments
  };
}

function makeAssignmentData(item_id = undefined,
                            title = undefined,
                            duetime = undefined,
                            state = 0) {
  return {
    "item_id": item_id,
    "title": title,
    "duetime": duetime,
    "state": state
  };
}
