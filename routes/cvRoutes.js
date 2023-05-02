const express = require("express");
const cvController = require("../controller/cvController");
const router = express.Router();

router.get("/auth_app", cvController.authApp);
router.get("/access_token", cvController.accessToken);
router.get("/get_info", cvController.getInfo);
router.get("/logout", cvController.logout);

router.get("/get", cvController.scanTable);
router.post("/post", cvController.postTable);

module.exports = router;