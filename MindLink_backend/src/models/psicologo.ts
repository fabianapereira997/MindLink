import mongoose = require('mongoose');

const psicologoSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    especialidade: { type: String, required: true },
    /** false quando o admin inativa o psicólogo. */
    ativo: { type: Boolean, default: true },
}, { timestamps: true });

const Psicologo = mongoose.model('Psicologo', psicologoSchema);

module.exports = Psicologo;
