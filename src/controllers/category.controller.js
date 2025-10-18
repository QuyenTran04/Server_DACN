const cloudinary = require("../configs/cloudinary");
const Category = require("../models/Category");

const bufferToDataURI = (buffer, mimetype) =>
  `data:${mimetype};base64,${buffer.toString("base64")}`;

exports.createCategory = async (req, res) => {
  try {
    const {name, parent, isActive } = req.body;
    if (!name) return res.status(400).json({ message: "Thiếu tên danh mục" });

    let iconUrl, iconPublicId;

    if (req.file) {
      const dataURI = bufferToDataURI(req.file.buffer, req.file.mimetype);
      const uploaded = await cloudinary.uploader.upload(dataURI, {
        folder: "lms/categories/icons",
        resource_type: "image",
      });
      iconUrl = uploaded.secure_url;
      iconPublicId = uploaded.public_id;
    }

    const doc = await Category.create({
      name,
      parent: parent || null,
      isActive: isActive !== undefined ? isActive : true,
      iconUrl,
      iconPublicId,
    });

    return res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Tạo danh mục thất bại" });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });
    return res.json(categories);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Lấy danh mục thất bại" });
    }
};
exports.getParentCategories = async (req, res) => {
  try {
    const parents = await Category.find({
      $or: [{ parent: { $exists: false } }, { parent: null }],
    })
      .select("_id name iconUrl createdAt")
      .sort({ createdAt: 1 });
    res.json(parents);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// GET /api/categories/:parentId/children
exports.getChildrenByParent = async (req, res) => {
  try {
    const { parentId } = req.params;
    const children = await Category.find({ parent: parentId })
      .select("_id name iconUrl createdAt")
      .sort({ createdAt: 1 });
    res.json(children);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// GET /api/categories/tree  (cha kèm danh sách con)
exports.getCategoryTree = async (req, res) => {
  try {
    const tree = await Category.aggregate([
      { $match: { $or: [{ parent: { $exists: false } }, { parent: null }] } },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "parent",
          as: "children",
          pipeline: [{ $project: { _id: 1, name: 1, iconUrl: 1 } }],
        },
      },
      { $project: { _id: 1, name: 1, iconUrl: 1, children: 1 } },
    ]);
    res.json(tree);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};



