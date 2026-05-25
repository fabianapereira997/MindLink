import mongoose = require('mongoose');

const desafioSchema = new mongoose.Schema({
    paciente:    { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente', required: true },
    psicologo:   { type: mongoose.Schema.Types.ObjectId, ref: 'Psicologo', required: true },
    titulo:      { type: String, required: true },
    descricao:   { type: String, required: true },
    tipo:        { type: String, required: true, enum: ['diario', 'semanal', 'mensal'] },
    data_inicio: { type: Date, required: true },
    data_fim:    { type: Date, required: true },
    estado:      { type: String, required: true, enum: ['pendente', 'concluido', 'cancelado'], default: 'pendente' },
    sugestao:    { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Desafio', desafioSchema);
