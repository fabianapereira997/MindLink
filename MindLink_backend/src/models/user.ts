import mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    nome: { type: String, required: true },
    genero: { type: String, required: true },
    data_nascimento: { type: Date, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    tipo: { type: String, required: true, enum: ['psicologo', 'paciente', 'admin'] },
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;
