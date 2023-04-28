const dotenv=require("dotenv");
dotenv.config();
const https=require("https");
const url = require("url");
const querystring = require("querystring");

const redirect_uri = `http://${process.env.backendIPAddress}/courseville/access_token`;
const authorization_url = `https://www.mycourseville.com/api/oauth/authorize?response_type=code&client_id=${process.env.client_id}&redirect_uri=${redirect_uri}`;
const access_token_url = "https://www.mycourseville.com/api/oauth/access_token";
exports.authApp = (req, res) => {
    res.redirect(authorization_url);
};

exports.accessToken = (req, res) => {
    const parsedUrl = url.parse(req.url);
    const parsedQuery = querystring.parse(parsedUrl.query);
  
    if (parsedQuery.error) {
      res.writeHead(400, { "Content-Type": "text/plain" });
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
            console.log(req.session);
            if (token) {
              res.writeHead(302, {
                Location: `http://${process.env.frontendIPAddress}/home.html`, //need to be fixed
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
      res.writeHead(302, { Location: authorization_url });
      res.end();
    }
  };

exports.getUserInfo = (req,res)=>{
  try {
    const profileOptions = {
      headers: {
        Authorization: `Bearer ${req.session.token.access_token}`,
      },
    };
    const profileReq = https.request(
      "https://www.mycourseville.com/api/v1/public/get/user/info",
      profileOptions,
      (profileRes) => {
        let profileData = "";
        profileRes.on("data", (chunk) => {
          profileData += chunk;
        });
        profileRes.on("end", () => {
          profileInfo=JSON.parse(profileData);
          const studentInfo=profileInfo.data.student;
          const makeUserData=function(student_id=studentInfo.id,
                                        firstname_en=studentInfo.firstname_en,
                                        lastname_en=studentInfo.lastname_en,
                                        uid=profileInfo.data.account.uid){
                              return{
                                "student_id":student_id,
                                "firstname_en":firstname_en,
                                "lastname_en":lastname_en,
                                "uid":uid
                              };
                            };
          res.send(makeUserData());
          res.end();
        });
      }
    );
    profileReq.on("error", (err) => {
      console.error(err);
    });
    profileReq.end();
  } catch (error) {
    console.log(error);
    console.log("Please logout, then login again.");
  }
};

exports.getCourses = (req,res) => {
    const options ={
      headers: {
        Authorization: `Bearer ${req.session.token.access_token}`,
      },
    };
    try{
      const Req=https.request(
        "https://www.mycourseville.com/api/v1/public/get/user/courses",
        options,
        (Res)=>{
          let responseData="";
          Res.on("data",(chunk)=> {
            responseData+=chunk;
          });
          Res.on("end",()=>{
            const response=JSON.parse(responseData);
            const courseInfo=response.data.student;
            const totalCourse='{"courses": ';
            for(const course of courseInfo){
              if(course.semester==2){
                totalCourse+='{"cv_cid":"'+course.cv_cid+'",';
                totalCourse+='"course_no":"'+course.course_no+'"},';
              }
            }
            totalCourse=totalCourse.slice(0,totalCourse.length-1)+'}';
            totalCourse=JSON.parse(totalCourse);
            res.send(totalCourse);
            res.end();
          });
        }
        );
        Req.on("error",(err)=> {
          console.error(err);
        });
        Req.end();
    } catch(error){
      console.log(error);
      console.log("Please logout, then login again.");
    }
    res.end();
};

// exports.getCourseAssignments=(req,res)=>{
//   const cv_cid=req.params.cv_cid;
//   const options = {
//     headers:{
//       Authorizatiton: `Bearer ${req.session.token.access_token}`,
//     },
//   };
//   try{
//     const Req=https.request(
//       "https://www.mycourseville.com/api/v1/public/get/course/assignments?cv_cid="+cv_cid+"&detail=1",
//       options,
//       (Res)=>{
//         let responseData="";
//         Res.on("data",(chunk)=>{
//           responseData+=chunk;
//         });
//         Res.on("end",()=> {
//           const response=JSON.parse(responseData);
//           res.send(response);
//           res.end();
//         });
//       }
//     );
//     Req.on("error",(err)=>{
//       console.error(err);
//     });
//     Req.end();
//   } catch (error){
//     console.log(error);
//     console.log("Please logout, then login again.");
//   }
// };

// exports.getItemAssignment=(req,res)=>{
//   const item_id=req.params.item_id;  //need to be fixed
//   const options={
//     headers:{
//       Authorizatiton: `Bearer ${req.session.token.access_token}`,
//     },
//   };
//   try{
//     const Req=https.request(
//       "https://www.mycourseville.com/api/v1/public/get/item/assignment?item_id="+item_id,
//       options,
//       (Res)=>{
//         let responseData="";
//         Res.on("data",(chunk)=>{
//           responseData+=chunk;
//         });
//         Res.on("end",()=> {
//           const response=JSON.parse(responseData);
//           res.send(response);
//           res.end();
//         });
//       }
//     );
//     Req.on("error",(err)=>{
//       console.error(err);
//     });
//     Req.end();
//   } catch (error){
//     console.log(error);
//     console.log("Please logout, then login again.");
//   }
// };