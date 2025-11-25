require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
app.use(cors());

// Variables de entorno
const JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

// Validación obligatoria
if (!MONGO_URI) {
  throw new Error("❌ ERROR: La variable MONGO_URI no está configurada.");
}

// Conexión a MongoDB
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB"))
  .catch((err) => console.error("❌ Error de conexión:", err));

// Modelos
const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
});
const User = mongoose.model("User", UserSchema);

const ReviewSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  userName: { type: String, required: true },
  problemDate: { type: Date, required: true },
  problemDescription: { type: String, required: true },
  toolsUsed: { type: String, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comment: { type: String, required: true },
  date: { type: Date, default: Date.now },
});
const Review = mongoose.model("Review", ReviewSchema);

const ProblemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  urgency: { type: String, enum: ["Baja", "Media", "Alta"], required: true },
  createdAt: { type: Date, default: Date.now },
});
const Problem = mongoose.model("Problem", ProblemSchema);

// Rutas
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser)
      return res.status(400).json({ success: false, message: "El usuario ya existe" });

    const user = new User({ name, email, password });
    await user.save();

    res.json({ success: true, message: "Usuario registrado con éxito" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, password });
    if (!user)
      return res.status(401).json({ success: false, message: "Credenciales inválidas" });

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "Login exitoso",
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error interno del servidor" });
  }
});

app.get("/api/verify", async (req, res) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Token requerido" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "Usuario no encontrado" });

    res.json({ success: true, user });
  } catch (error) {
    res.status(401).json({ success: false, message: "Token inválido" });
  }
});

app.post("/api/problems", async (req, res) => {
  try {
    const { title, description, category, urgency } = req.body;

    const normalizedUrgency =
      urgency.charAt(0).toUpperCase() + urgency.slice(1).toLowerCase();

    const problem = new Problem({
      title,
      description,
      category,
      urgency: normalizedUrgency,
    });

    await problem.save();
    res.status(201).json({ success: true, message: "Problema guardado exitosamente" });
  } catch (error) {
    res.status(500).json({ success: false, message: "No se pudo guardar el problema" });
  }
});

app.post("/api/reviews", async (req, res) => {
  try {
    const review = new Review(req.body);
    await review.save();

    res.status(201).json({ success: true, message: "Reseña creada con éxito", review });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al crear reseña" });
  }
});

app.get("/api/reviews", async (req, res) => {
  try {
    const reviews = await Review.find().sort({ date: -1 });
    res.json({ success: true, reviews });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error al obtener reseñas" });
  }
});

// Inicio del servidor
app.listen(PORT, () => console.log(`🚀 Servidor listo en el puerto ${PORT}`));
