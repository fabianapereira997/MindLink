import mongoose = require('mongoose');

const alertaSchema = new mongoose.Schema({
    paciente:  { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente', required: true },
    psicologo: { type: mongoose.Schema.Types.ObjectId, ref: 'Psicologo', required: true },
    tipo:      { type: String, required: true, enum: ['humor_baixo', 'urgente', 'sintomas', 'consulta'] },
    nivel:     { type: String, required: true, enum: ['baixo', 'medio', 'alto'] },
    mensagem:  { type: String, required: true },
    lido:      { type: Boolean, default: false },
    origem:    { type: String, required: true, enum: ['analise', 'consulta', 'manual'], default: 'analise' },
}, { timestamps: true });

module.exports = mongoose.model('Alerta', alertaSchema);
