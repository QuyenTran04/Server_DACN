const router = require("express").Router();
const { semanticSearch } = require("../controllers/search.controller");


router.get("/semantic", semanticSearch);


module.exports = router;
