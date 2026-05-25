import mongoose = require('mongoose');

const pacienteSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    psicologo: { type: mongoose.Schema.Types.ObjectId, ref: 'Psicologo', required: true },
    doenca: { type: String, required: true },
    formulario: {
        historicoMedico: {
            comorbilidades: [{ type: String }],
        },
        estiloDeVida: {
            exercicioRegular: { type: Boolean, default: null },
            fumador: { type: Boolean, default: null }
        }
    },
}, { timestamps: true });

const Paciente = mongoose.model('Paciente', pacienteSchema);

module.exports = Paciente;
