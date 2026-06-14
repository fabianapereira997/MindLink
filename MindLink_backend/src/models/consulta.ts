import mongoose = require('mongoose');

const consultaSchema = new mongoose.Schema({
    paciente:  { type: mongoose.Schema.Types.ObjectId, ref: 'Paciente', required: true },
    psicologo: { type: mongoose.Schema.Types.ObjectId, ref: 'Psicologo', required: true },
    data:      { type: Date, required: true },
    duracao:   { type: Number, required: true, min: 1 }, // duration in minutes
    estado:    { type: String, required: true, enum: ['pendente', 'agendada', 'realizada', 'cancelada'], default: 'agendada' },
    notas:     { type: String },
}, { timestamps: true });

module.exports = mongoose.model('Consulta', consultaSchema);
