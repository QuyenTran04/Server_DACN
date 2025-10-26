const category = require("../controllers/category.controller");
const middlewares = require("../middlewares/auth");
const express = require("express");
const router = express.Router();
const upload = require("../middlewares/upload");


router.post(
    "/createCategory",
    middlewares.requireAuth,
    middlewares.requireRole("admin"),
    upload.single("icon"),
    category.createCategory
);
router.get("/getCategories", category.getCategories);

router.get("/parents", category.getParentCategories);

// Danh mục CON theo CHA
router.get("/:parentId/children", category.getChildrenByParent);

// Cây 2 tầng (CHA + CON)
router.get("/tree", category.getCategoryTree);
module.exports = router;