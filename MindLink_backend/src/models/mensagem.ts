import mongoose = require('mongoose');

const mensagemSchema = new mongoose.Schema({
    paciente:  { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente', required: true },
    psicologo: { type: mongoose.Schema.Types.ObjectId, ref: 'Psicologo', required: true },
    remetente: { type: String, required: true, enum: ['paciente', 'psicologo'] },
    mensagem:  { type: String, required: true },
    data:      { type: Date, default: Date.now },
    lida:      { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Mensagem', mensagemSchema);
