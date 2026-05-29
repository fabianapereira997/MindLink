import { Request, Response } from 'express';
import {
    getPsicologoByUserId,
    getPacienteByUserId,
    isPsicologoAssignedToPaciente,
    isValidObjectId,
} from '../utils/helpers';

const express       = require('express');
const router        = express.Router();
const Questionario  = require('../models/questionario');
const Paciente      = require('../models/paciente');
const { verifyToken }       = require('../middleware/VerifyToken');
const { verifyTokenByRole } = require('../middleware/VerifyTokenByRole');

// ─── POST /api/questionarios — submit questionnaire response ───────────────────
// Paciente only. `paciente` is auto-filled from the logged-in profile.
// Any `paciente` field in the body is ignored — the server always derives it.
router.post('/', verifyToken, verifyTokenByRole('paciente'), async (req: Request, res: Response) => {
    try {
        const pacienteProfile = await getPacienteByUserId(req.user!.id);
        if (!pacienteProfile) {
            return res.status(404).json({ error: 'Perfil de paciente não encontrado' });
        }

        const { data, humor, sintomas, notas } = req.body;
        const questionario = new Questionario({
            paciente: pacienteProfile._id,   // always auto-filled; body value ignored
            data,
            humor,
            sintomas,
            notas,
        });
        await questionario.save();
        res.status(201).json(questionario);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── GET /api/questionarios — scoped list ─────────────────────────────────────
// Psicologo: only responses from their assigned pacientes.
// Paciente: only their own responses.
router.get('/', verifyToken, verifyTokenByRole('psicologo', 'paciente'), async (req: Request, res: Response) => {
    try {
        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile) {
                return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
            }
            // Collect all paciente IDs assigned to this psicologo
            const pacientes = await Paciente.find({ psicologo: psicologoProfile._id }, '_id');
            const pacienteIds = pacientes.map((p: any) => p._id);
            const questionarios = await Questionario.find({ paciente: { $in: pacienteIds } })
                .populate('paciente');
            return res.json(questionarios);
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile) {
                return res.status(404).json({ error: 'Perfil de paciente não encontrado' });
            }
            const questionarios = await Questionario.find({ paciente: pacienteProfile._id })
                .populate('paciente');
            return res.json(questionarios);
        }
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/questionarios/paciente/:pacienteId — responses for a paciente ───
// Psicologo: only if that paciente is assigned to them.
// Paciente: only their own responses.
// Must come before /:id to avoid route conflict.
router.get('/paciente/:pacienteId', verifyToken, verifyTokenByRole('psicologo', 'paciente'), async (req: Request, res: Response) => {
    try {
        const { pacienteId } = req.params;
        if (!isValidObjectId(pacienteId)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || pacienteProfile._id.toString() !== pacienteId) {
                return res.status(403).json({ error: 'Acesso negado: não pode ver questionários de outro paciente' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const assigned = await isPsicologoAssignedToPaciente(req.user!.id, pacienteId);
            if (!assigned) {
                return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
            }
        }

        const questionarios = await Questionario.find({ paciente: pacienteId }).populate('paciente');
        res.json(questionarios);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/questionarios/:id — get one response by ID ──────────────────────
// Paciente: only their own. Psicologo: only for an assigned paciente.
router.get('/:id', verifyToken, verifyTokenByRole('psicologo', 'paciente'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de questionário inválido' });
        }

        const questionario = await Questionario.findById(id).populate('paciente');
        if (!questionario) {
            return res.status(404).json({ error: 'Questionário não encontrado' });
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || questionario.paciente._id.toString() !== pacienteProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: questionário não pertence a este paciente' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const assigned = await isPsicologoAssignedToPaciente(req.user!.id, questionario.paciente._id.toString());
            if (!assigned) {
                return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
            }
        }

        res.json(questionario);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── PUT /api/questionarios/:id — edit own response ───────────────────────────
// Paciente only. Must own the response. Cannot change the `paciente` field.
router.put('/:id', verifyToken, verifyTokenByRole('paciente'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de questionário inválido' });
        }

        const pacienteProfile = await getPacienteByUserId(req.user!.id);
        if (!pacienteProfile) {
            return res.status(404).json({ error: 'Perfil de paciente não encontrado' });
        }

        const existing = await Questionario.findById(id);
        if (!existing) {
            return res.status(404).json({ error: 'Questionário não encontrado' });
        }
        if (existing.paciente.toString() !== pacienteProfile._id.toString()) {
            return res.status(403).json({ error: 'Acesso negado: questionário não pertence a este paciente' });
        }

        // Strip ownership field from body
        const { paciente: _p, ...safeBody } = req.body;
        void _p;

        const questionario = await Questionario.findByIdAndUpdate(id, safeBody, { new: true, runValidators: true })
            .populate('paciente');
        res.json(questionario);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── DELETE /api/questionarios/:id — disabled ─────────────────────────────────
// Paciente questionnaire responses are permanent records. Operation not permitted.
router.delete('/:id', verifyToken, (_req: Request, res: Response) => {
    res.status(403).json({ error: 'Operação não permitida: respostas de questionário não podem ser eliminadas' });
});

module.exports = { questionarioRoutes: router };
