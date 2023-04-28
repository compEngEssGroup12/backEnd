const express = require("express");
const cvController = require("../controller/cvController");
const router=express.Router();

router.get("/auth_app", cvController.authApp);
router.get("/access_token", cvController.accessToken);
router.get("/get_courses",cvController.getCourses);
router.get("/get_user_info",cvController.getUserInfo);
// router.get("/get_course_assignments",cvController.getCourseAssignments);
// router.get("/get_item_assignment",cvController.getItemAssignment);