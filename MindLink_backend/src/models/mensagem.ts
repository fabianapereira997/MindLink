import mongoose = require('mongoose');

const mensagemSchema = new mongoose.Schema({
    paciente:  { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente', required: true },
    psicologo: { type: mongoose.Schema.Types.ObjectId, ref: 'Psicologo', required: true },
    remetente: { type: String, required: true, enum: ['paciente', 'psicologo'] },
    mensagem:  { type: String, required: true },
    replyTo:   { type: String },
    data:      { type: Date, default: Date.now },
    lida:      { type: Boolean, default: false },

    // ── Special message types (consulta scheduling popups) ─────────────────
    tipo: {
        type: String,
        enum: ['texto', 'consulta_pedido', 'consulta_cancelada'],
        default: 'texto',
    },
    consulta:        { type: mongoose.Schema.Types.ObjectId, ref: 'Consulta' },
    consultaData:    { type: Date },
    consultaDuracao: { type: Number },
    resposta: {
        type: String,
        enum: ['pendente', 'confirmada', 'rejeitada'],
    },
}, { timestamps: true });

module.exports = mongoose.model('Mensagem', mensagemSchema);
