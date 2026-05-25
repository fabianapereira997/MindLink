import { Request, Response } from 'express';
import {
    getPsicologoByUserId,
    getPacienteByUserId,
    isPsicologoAssignedToPaciente,
    isValidObjectId,
} from '../utils/helpers';

const express  = require('express');
const router   = express.Router();
const Consulta = require('../models/consulta');
const { verifyToken }       = require('../middleware/VerifyToken');
const { verifyTokenByRole } = require('../middleware/VerifyTokenByRole');

// ─── POST /api/consultas ───────────────────────────────────────────────────────
// Psicologo only. psicologo is auto-filled from the logged-in profile.
router.post('/', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile) {
            return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
        }
        const { paciente, data, duracao, estado, notas } = req.body;
        const consulta = new Consulta({ paciente, psicologo: psicologoProfile._id, data, duracao, estado, notas });
        await consulta.save();
        res.status(201).json(consulta);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── GET /api/consultas ────────────────────────────────────────────────────────
// Psicologo: only their own. Admin: all.
router.get('/', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        let filter: Record<string, unknown> = {};

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile) {
                return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
            }
            filter = { psicologo: psicologoProfile._id };
        }

        const consultas = await Consulta.find(filter)
            .populate('paciente')
            .populate('psicologo');
        res.json(consultas);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/consultas/psicologo/:psicologoId ────────────────────────────────
// Psicologo: only if :psicologoId is their own profile. Admin: any.
// Must come before /:id.
router.get('/psicologo/:psicologoId', verifyToken, verifyTokenByRole('psicologo', 'admin'), async (req: Request, res: Response) => {
    try {
        const { psicologoId } = req.params;
        if (!isValidObjectId(psicologoId)) {
            return res.status(400).json({ error: 'ID de psicólogo inválido' });
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || psicologoProfile._id.toString() !== psicologoId) {
                return res.status(403).json({ error: 'Acesso negado: não pode ver consultas de outro psicólogo' });
            }
        }

        const consultas = await Consulta.find({ psicologo: psicologoId })
            .populate('paciente')
            .populate('psicologo');
        res.json(consultas);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/consultas/paciente/:pacienteId ───────────────────────────────────
// Paciente: only their own. Psicologo: only their own consultas with that patient.
// Must come before /:id.
router.get('/paciente/:pacienteId', verifyToken, verifyTokenByRole('psicologo', 'paciente', 'admin'), async (req: Request, res: Response) => {
    try {
        const { pacienteId } = req.params;
        if (!isValidObjectId(pacienteId)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        const filter: Record<string, unknown> = { paciente: pacienteId };

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || pacienteProfile._id.toString() !== pacienteId) {
                return res.status(403).json({ error: 'Acesso negado: não pode ver consultas de outro paciente' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile) {
                return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
            }
            filter['psicologo'] = psicologoProfile._id;
        }

        const consultas = await Consulta.find(filter)
            .populate('paciente')
            .populate('psicologo');
        res.json(consultas);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/consultas/:id ────────────────────────────────────────────────────
// Psicologo: only if theirs. Paciente: only if theirs. Admin: any.
router.get('/:id', verifyToken, verifyTokenByRole('psicologo', 'paciente', 'admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de consulta inválido' });
        }

        const consulta = await Consulta.findById(id)
            .populate('paciente')
            .populate('psicologo');
        if (!consulta) {
            return res.status(404).json({ error: 'Consulta não encontrada' });
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || consulta.psicologo._id.toString() !== psicologoProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: consulta não pertence a este psicólogo' });
            }
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || consulta.paciente._id.toString() !== pacienteProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: consulta não pertence a este paciente' });
            }
        }

        res.json(consulta);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── PUT /api/consultas/:id ────────────────────────────────────────────────────
// Psicologo only. Must own the consulta.
router.put('/:id', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de consulta inválido' });
        }

        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile) {
            return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
        }

        const existing = await Consulta.findById(id);
        if (!existing) {
            return res.status(404).json({ error: 'Consulta não encontrada' });
        }
        if (existing.psicologo.toString() !== psicologoProfile._id.toString()) {
            return res.status(403).json({ error: 'Acesso negado: consulta não pertence a este psicólogo' });
        }

        const consulta = await Consulta.findByIdAndUpdate(id, req.body, { new: true, runValidators: true })
            .populate('paciente')
            .populate('psicologo');
        res.json(consulta);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── DELETE /api/consultas/:id ─────────────────────────────────────────────────
// Psicologo only. Must own the consulta.
router.delete('/:id', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de consulta inválido' });
        }

        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile) {
            return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
        }

        const existing = await Consulta.findById(id);
        if (!existing) {
            return res.status(404).json({ error: 'Consulta não encontrada' });
        }
        if (existing.psicologo.toString() !== psicologoProfile._id.toString()) {
            return res.status(403).json({ error: 'Acesso negado: consulta não pertence a este psicólogo' });
        }

        await Consulta.findByIdAndDelete(id);
        res.json({ message: 'Consulta removida com sucesso' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

module.exports = { consultaRoutes: router };
