import { Request, Response } from 'express';
import {
    getPsicologoByUserId,
    getPacienteByUserId,
    isPsicologoAssignedToPaciente,
    isValidObjectId,
    isTodayOrPast,
} from '../utils/helpers';

import { buildPacienteCompletoXml, buildPacientesListaXml, validateXmlAgainstXsd } from '../utils/xmlExport';

const express     = require('express');
const router      = express.Router();
const Paciente    = require('../models/paciente');
const User        = require('../models/user');
const Questionario = require('../models/questionario');
const Desafio     = require('../models/desafio');
const Consulta    = require('../models/consulta');
const bcrypt   = require('bcryptjs');
const { verifyToken }       = require('../middleware/VerifyToken');
const { verifyTokenByRole } = require('../middleware/VerifyTokenByRole');

// ─── POST /api/pacientes — create paciente profile ────────────────────────────
// Psicologo only. The psicologo field is auto-filled from the logged-in psicologo.
// Either supply `user` (an existing User._id), or supply the new patient's
// account details (nome, email, password, genero, data_nascimento) so that a
// new User account is created together with the Paciente profile.
router.post('/', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile) {
            return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
        }

        const { user, nome, email, password, genero, data_nascimento, doenca, formulario } = req.body;

        let userId = user;
        if (!userId) {
            if (!nome || !email || !password) {
                return res.status(400).json({ error: 'nome, email e password são obrigatórios' });
            }

            if (data_nascimento && !isTodayOrPast(data_nascimento)) {
                return res.status(400).json({ error: 'A data de nascimento não pode ser uma data futura' });
            }

            const exists = await User.findOne({ email });
            if (exists) {
                return res.status(409).json({ error: 'Email já registado' });
            }

            const hashedPassword = await bcrypt.hash(password, 12);
            const newUser = await new User({
                nome,
                email,
                password: hashedPassword,
                genero: genero ?? 'outro',
                data_nascimento: data_nascimento ?? new Date('1990-01-01'),
                tipo: 'paciente',
                mustChangePassword: true,
            }).save();
            userId = newUser._id;
        }

        // psicologo is always the logged-in psicologo — never trusted from body
        const paciente = new Paciente({ user: userId, psicologo: psicologoProfile._id, doenca, formulario });
        await paciente.save();

        const populated = await Paciente.findById(paciente._id)
            .populate('user', '-password')
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        res.status(201).json(populated);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── GET /api/pacientes — scoped list ─────────────────────────────────────────
// Psicologo: only their assigned pacientes.
// Paciente: only their own profile (returned as an array for consistency).
// Admin: all pacientes.
router.get('/', verifyToken, verifyTokenByRole('psicologo', 'paciente', 'admin'), async (req: Request, res: Response) => {
    try {
        if (req.user!.tipo === 'admin') {
            const pacientes = await Paciente.find()
                .populate('user', '-password')
                .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
            return res.json(pacientes);
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile) {
                return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
            }
            const pacientes = await Paciente.find({ psicologo: psicologoProfile._id })
                .populate('user', '-password')
                .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
            return res.json(pacientes);
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile) {
                return res.status(404).json({ error: 'Perfil de paciente não encontrado' });
            }
            const paciente = await Paciente.findById(pacienteProfile._id)
                .populate('user', '-password')
                .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
            return res.json([paciente]);
        }
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/pacientes/export/lista — export da lista de pacientes (XML) ────
// Psicologo only. Exporta um resumo (nome, email, doença) de todos os pacientes
// associados ao psicólogo autenticado, validado contra pacientes-lista.xsd.
// Deve ser declarado antes de /:id para não ser interpretado como um ID.
router.get('/export/lista', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile) {
            return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
        }

        const pacientes = await Paciente.find({ psicologo: psicologoProfile._id })
            .populate('user', '-password');

        const xml = buildPacientesListaXml(psicologoProfile, pacientes);
        await validateXmlAgainstXsd(xml, 'pacientes-lista.xsd');

        res.set('Content-Type', 'application/xml');
        res.set('Content-Disposition', 'attachment; filename="pacientes.xml"');
        res.send(xml);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/pacientes/psicologo/:psicologoId — pacientes of a psicologo ─────
// Only the psicologo who owns that profile can access.
// Must come before /:id to avoid route conflict.
router.get('/psicologo/:psicologoId', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { psicologoId } = req.params;
        if (!isValidObjectId(psicologoId)) {
            return res.status(400).json({ error: 'ID de psicólogo inválido' });
        }

        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile || psicologoProfile._id.toString() !== psicologoId) {
            return res.status(403).json({ error: 'Acesso negado: não pode ver pacientes de outro psicólogo' });
        }

        const pacientes = await Paciente.find({ psicologo: psicologoId })
            .populate('user', '-password')
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        res.json(pacientes);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/pacientes/:id — get paciente by id ──────────────────────────────
// Paciente: only their own profile. Psicologo: only if assigned. Admin: any.
router.get('/:id', verifyToken, verifyTokenByRole('psicologo', 'paciente', 'admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || pacienteProfile._id.toString() !== id) {
                return res.status(403).json({ error: 'Acesso negado: não pode ver o perfil de outro paciente' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const assigned = await isPsicologoAssignedToPaciente(req.user!.id, id);
            if (!assigned) {
                return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
            }
        }

        const paciente = await Paciente.findById(id)
            .populate('user', '-password')
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        if (!paciente) {
            return res.status(404).json({ error: 'Paciente não encontrado' });
        }
        res.json(paciente);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/pacientes/:id/export — export completo do paciente (XML) ────────
// Paciente: apenas o seu próprio perfil. Psicologo: apenas se associado. Admin: qualquer.
// Inclui perfil, formulário, registos de humor, desafios e consultas, validado
// contra paciente-completo.xsd.
router.get('/:id/export', verifyToken, verifyTokenByRole('psicologo', 'paciente', 'admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || pacienteProfile._id.toString() !== id) {
                return res.status(403).json({ error: 'Acesso negado: não pode exportar os dados de outro paciente' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const assigned = await isPsicologoAssignedToPaciente(req.user!.id, id);
            if (!assigned) {
                return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
            }
        }

        const paciente = await Paciente.findById(id)
            .populate('user', '-password')
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        if (!paciente) {
            return res.status(404).json({ error: 'Paciente não encontrado' });
        }

        const [questionarios, desafios, consultas] = await Promise.all([
            Questionario.find({ paciente: id }).sort({ data: 1 }),
            Desafio.find({ paciente: id }).sort({ data_inicio: 1 }),
            Consulta.find({ paciente: id }).sort({ data: 1 }),
        ]);

        const xml = buildPacienteCompletoXml(paciente, questionarios, desafios, consultas);
        await validateXmlAgainstXsd(xml, 'paciente-completo.xsd');

        res.set('Content-Type', 'application/xml');
        res.set('Content-Disposition', `attachment; filename="paciente-${id}.xml"`);
        res.send(xml);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── PUT /api/pacientes/:id — update paciente ─────────────────────────────────
// Psicologo: can update clinical/profile data for their assigned pacientes.
// Paciente: can only update their own `formulario.estiloDeVida` (exercicioRegular, fumador).
// Prevents changing `user` or `psicologo` ownership fields, and `doenca`/comorbilidades for pacientes.
router.put('/:id', verifyToken, verifyTokenByRole('psicologo', 'paciente'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        let safeBody: Record<string, unknown>;

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || pacienteProfile._id.toString() !== id) {
                return res.status(403).json({ error: 'Acesso negado: não pode editar o perfil de outro paciente' });
            }

            // Pacientes may only update their own estilo de vida
            const { exercicioRegular, fumador } = req.body?.formulario?.estiloDeVida ?? {};
            safeBody = {
                'formulario.estiloDeVida.exercicioRegular': exercicioRegular ?? null,
                'formulario.estiloDeVida.fumador': fumador ?? null,
            };
        } else {
            const assigned = await isPsicologoAssignedToPaciente(req.user!.id, id);
            if (!assigned) {
                return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
            }

            // Strip ownership fields from body
            const { user: _u, psicologo: _ps, ...rest } = req.body;
            void _u; void _ps;
            safeBody = rest;
        }

        const paciente = await Paciente.findByIdAndUpdate(id, safeBody, { new: true, runValidators: true })
            .populate('user', '-password')
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        if (!paciente) {
            return res.status(404).json({ error: 'Paciente não encontrado' });
        }
        res.json(paciente);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── DELETE /api/pacientes/:id — remove paciente + user ───────────────────────
// Psicologo only, and only for pacientes assigned to them. Removes both the
// Paciente profile and the underlying User account.
router.delete('/:id', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        const assigned = await isPsicologoAssignedToPaciente(req.user!.id, id);
        if (!assigned) {
            return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
        }

        const paciente = await Paciente.findById(id);
        if (!paciente) {
            return res.status(404).json({ error: 'Paciente não encontrado' });
        }

        await Paciente.findByIdAndDelete(id);
        await User.findByIdAndDelete(paciente.user);
        res.json({ message: 'Paciente removido com sucesso' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

module.exports = { pacienteRoutes: router };
