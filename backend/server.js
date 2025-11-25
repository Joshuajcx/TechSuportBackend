cat > server.js << 'EOF'
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// Configuración
const JWT_SECRET = process.env.JWT_SECRET;
const MONGO_URI = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

// Validar variables de entorno
if (!JWT_SECRET || !MONGO_URI) {
  console.error("❌ Faltan variables de entorno requeridas");
  process.exit(1);
}

// Conexión a MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB Atlas"))
  .catch((err) => {
    console.error("❌ Error de conexión a MongoDB:", err);
    process.exit(1);
  });

// Esquemas
const UserSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
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

// Middleware de autenticación
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: "Token requerido" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: "Token inválido" });
    }
    req.user = user;
    next();
  });
};

// REGISTRO
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Nombre, email y contraseña son requeridos" 
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: "El usuario ya existe" 
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ 
      name, 
      email, 
      password: hashedPassword 
    });
    await user.save();

    res.status(201).json({ 
      success: true, 
      message: "Usuario registrado con éxito" 
    });
  } catch (error) {
    console.error("Error en registro:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error interno del servidor" 
    });
  }
});

// LOGIN
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Email y contraseña son requeridos" 
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: "Credenciales inválidas" 
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ 
        success: false, 
        message: "Credenciales inválidas" 
      });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      success: true,
      message: "Login exitoso",
      token,
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email 
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    res.status(500).json({ 
      success: false, 
      message: "Error interno del servidor" 
    });
  }
});

// Ruta de salud
app.get("/api/health", (req, res) => {
  res.json({ 
    success: true, 
    message: "Servidor funcionando correctamente",
    timestamp: new Date().toISOString()
  });
});

// Verificar token
app.get("/api/verify", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "Usuario no encontrado" 
      });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(401).json({ success: false, message: "Token inválido" });
  }
});

// Registrar problema
app.post("/api/problems", async (req, res) => {
  try {
    const { title, description, category, urgency } = req.body;

    if (!title || !description || !category || !urgency) {
      return res.status(400).json({ 
        success: false, 
        message: "Todos los campos son requeridos" 
      });
    }

    const normalizedUrgency = urgency.charAt(0).toUpperCase() + urgency.slice(1).toLowerCase();
    const validUrgencies = ["Baja", "Media", "Alta"];
    if (!validUrgencies.includes(normalizedUrgency)) {
      return res.status(400).json({ 
        success: false, 
        message: "Nivel de urgencia no válido" 
      });
    }

    const newProblem = new Problem({
      title,
      description,
      category,
      urgency: normalizedUrgency,
    });
    await newProblem.save();

    res.status(201).json({ 
      success: true, 
      message: "Problema guardado exitosamente" 
    });
  } catch (error) {
    console.error("Error al guardar el problema:", error);
    res.status(500).json({ 
      success: false, 
      message: "No se pudo guardar el problema" 
    });
  }
});

// Crear reseña
app.post("/api/reviews", async (req, res) => {
  try {
    const { userId, userName, rating, comment, problemDate, problemDescription, toolsUsed } = req.body;

    if (!userId || !userName || !rating || !comment || !problemDate || !problemDescription || !toolsUsed) {
      return res.status(400).json({ 
        success: false, 
        message: "Faltan campos requeridos" 
      });
    }

    const review = new Review({
      userId,
      userName,
      rating,
      comment,
      problemDate,
      problemDescription,
      toolsUsed,
    });
    await review.save();

    res.status(201).json({ 
      success: true, 
      message: "Reseña creada con éxito", 
      review 
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error al crear reseña",
      error: error.message,
    });
  }
});

// Obtener reseñas
app.get("/api/reviews", async (req, res) => {
  try {
    const reviews = await Review.find().sort({ date: -1 });
    res.json({ success: true, reviews });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error al obtener reseñas",
      error: error.message,
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
EOF