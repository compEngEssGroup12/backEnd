const dotenv = require("dotenv");
dotenv.config();
const https = require("https");
const url = require("url");
const querystring = require("querystring");
const {data} = require("express-session/session/cookie");

const redirect_uri = `http://${process.env.backendIPAddress}/courseville/access_token`;
const authorization_url = `https://www.mycourseville.com/api/oauth/authorize?response_type=code&client_id=${process.env.client_id}&redirect_uri=${redirect_uri}`;
const access_token_url = "https://www.mycourseville.com/api/oauth/access_token";

const samplePayload = {
  "student_id": "6430000021",
  "firstname_en": "Sudyod",
  "lastname_en": "Khengmak",
  "courses": [
    {
      "cv_cid": 23442,
      "course_no": "2110356",
      "title": "Embbeded System [Section 1-2 and 33]",
      "assignments": [
        {
          "item_id": 34245,
          "title": "Pitchaya: Assignment 1 - Opamp - For Section 2  (Room 4-418)",
          "duetime": 1680195540,
          "state": 0 // haven't checked
        },
        {
          "item_id": 34246,
          "title": "Pitchaya: Assignment 2 - Opamp - For Section 2  (Room 4-418)",
          "duetime": 1680195540,
          "state": 1 // have checked
        }
      ]
    },
    {
      "cv_cid": 23443,
      "course_no": "2110357",
      "title": "Embbeded System La [Section 1-2 and 33]",
      "assignments": [
        {
          "item_id": 34247,
          "title": "Pitchayaya: Assignment 3 - Opamp - For Section 2  (Room 4-418)",
          "duetime": 1680195540,
          "state": 0
        },
        {
          "item_id": 34248,
          "title": "Pitchayaya: Assignment 4 - Opamp - For Section 2  (Room 4-418)",
          "duetime": 1690195540,
          "state": 1
        },
        {
          "item_id": 34249,
          "title": "Pitchayaya: Assignment 5 - Opamp - For Section 2  (Room 4-418)",
          "duetime": 1683022438,
          "state": 1
        }
      ]
    }
  ]
};

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
            console.log(userData);
            res.json(userData);
          });
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
      client_id: process.env.client_id,
      client_secret: process.env.client_secret,
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
              Location: `http://${process.env.frontendIPAddress}?status=ok`,
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
  res.redirect(`http://${process.env.frontendIPAddress}/login.html`);
  res.end();
};

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
