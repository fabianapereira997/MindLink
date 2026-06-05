import { Request, Response } from 'express';
import {
    getPsicologoByUserId,
    getPacienteByUserId,
    isPsicologoAssignedToPaciente,
    isValidObjectId,
} from '../utils/helpers';

const express = require('express');
const router  = express.Router();
const Desafio = require('../models/desafio');
const { verifyToken }       = require('../middleware/VerifyToken');
const { verifyTokenByRole } = require('../middleware/VerifyTokenByRole');

// ─── POST /api/desafios ────────────────────────────────────────────────────────
// Psicologo only. psicologo field is auto-filled; the body paciente must belong
// to the logged-in psicologo.
router.post('/', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile) {
            return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
        }

        const { paciente, titulo, descricao, tipo, data_inicio, data_fim, sugestao } = req.body;

        if (!isValidObjectId(paciente)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        const assigned = await isPsicologoAssignedToPaciente(req.user!.id, paciente);
        if (!assigned) {
            return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
        }

        const desafio = new Desafio({
            paciente,
            psicologo: psicologoProfile._id,
            titulo,
            descricao,
            tipo,
            data_inicio,
            data_fim,
            sugestao,
        });
        await desafio.save();
        res.status(201).json(desafio);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── GET /api/desafios ─────────────────────────────────────────────────────────
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

        const desafios = await Desafio.find(filter)
            .populate({ path: 'paciente', populate: { path: 'user', select: 'nome email' } })
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        res.json(desafios);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/desafios/paciente/:pacienteId ────────────────────────────────────
// Psicologo: only if that paciente belongs to them.
// Paciente: only if :pacienteId is their own profile.
// Must come before /:id.
router.get('/paciente/:pacienteId', verifyToken, verifyTokenByRole('psicologo', 'paciente', 'admin'), async (req: Request, res: Response) => {
    try {
        const { pacienteId } = req.params;
        if (!isValidObjectId(pacienteId)) {
            return res.status(400).json({ error: 'ID de paciente inválido' });
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || pacienteProfile._id.toString() !== pacienteId) {
                return res.status(403).json({ error: 'Acesso negado: não pode ver desafios de outro paciente' });
            }
        }

        if (req.user!.tipo === 'psicologo') {
            const assigned = await isPsicologoAssignedToPaciente(req.user!.id, pacienteId);
            if (!assigned) {
                return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
            }
        }

        const desafios = await Desafio.find({ paciente: pacienteId })
            .populate({ path: 'paciente', populate: { path: 'user', select: 'nome email' } })
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        res.json(desafios);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── GET /api/desafios/psicologo/:psicologoId ─────────────────────────────────
// Psicologo: only if :psicologoId matches their own profile.
// Admin: any.
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
                return res.status(403).json({ error: 'Acesso negado: não pode ver desafios de outro psicólogo' });
            }
        }

        const desafios = await Desafio.find({ psicologo: psicologoId })
            .populate({ path: 'paciente', populate: { path: 'user', select: 'nome email' } })
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        res.json(desafios);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── PATCH /api/desafios/:id/estado ───────────────────────────────────────────
// Paciente: can only set estado to "concluido" on their own desafio.
// Psicologo: can set any valid estado on their own desafio.
// Must come before /:id.
router.patch('/:id/estado', verifyToken, verifyTokenByRole('psicologo', 'paciente'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de desafio inválido' });
        }

        const desafio = await Desafio.findById(id);
        if (!desafio) {
            return res.status(404).json({ error: 'Desafio não encontrado' });
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || desafio.paciente.toString() !== pacienteProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: desafio não pertence a este paciente' });
            }
            const { estado } = req.body;
            if (estado !== 'concluido') {
                return res.status(403).json({ error: 'Paciente só pode marcar desafio como "concluido"' });
            }
            desafio.estado = 'concluido';
            await desafio.save();
            return res.json(desafio);
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || desafio.psicologo.toString() !== psicologoProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: desafio não pertence a este psicólogo' });
            }
            const { estado } = req.body;
            desafio.estado = estado;
            await desafio.save();
            return res.json(desafio);
        }
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── GET /api/desafios/:id ─────────────────────────────────────────────────────
// Psicologo: only if it's theirs. Paciente: only if assigned to them.
router.get('/:id', verifyToken, verifyTokenByRole('psicologo', 'paciente', 'admin'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de desafio inválido' });
        }

        const desafio = await Desafio.findById(id)
            .populate({ path: 'paciente', populate: { path: 'user', select: 'nome email' } })
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        if (!desafio) {
            return res.status(404).json({ error: 'Desafio não encontrado' });
        }

        if (req.user!.tipo === 'psicologo') {
            const psicologoProfile = await getPsicologoByUserId(req.user!.id);
            if (!psicologoProfile || desafio.psicologo._id.toString() !== psicologoProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: desafio não pertence a este psicólogo' });
            }
        }

        if (req.user!.tipo === 'paciente') {
            const pacienteProfile = await getPacienteByUserId(req.user!.id);
            if (!pacienteProfile || desafio.paciente._id.toString() !== pacienteProfile._id.toString()) {
                return res.status(403).json({ error: 'Acesso negado: desafio não pertence a este paciente' });
            }
        }

        res.json(desafio);
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

// ─── PUT /api/desafios/:id ─────────────────────────────────────────────────────
// Psicologo only. Must own the desafio.
router.put('/:id', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de desafio inválido' });
        }

        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile) {
            return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
        }

        const existing = await Desafio.findById(id);
        if (!existing) {
            return res.status(404).json({ error: 'Desafio não encontrado' });
        }
        if (existing.psicologo.toString() !== psicologoProfile._id.toString()) {
            return res.status(403).json({ error: 'Acesso negado: desafio não pertence a este psicólogo' });
        }

        // Prevent changing ownership fields
        const { paciente: _p, psicologo: _ps, ...safeBody } = req.body;
        void _p; void _ps;

        const desafio = await Desafio.findByIdAndUpdate(id, safeBody, { new: true, runValidators: true })
            .populate({ path: 'paciente', populate: { path: 'user', select: 'nome email' } })
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } });
        res.json(desafio);
    } catch (error) {
        res.status(400).json({ error: (error as Error).message });
    }
});

// ─── DELETE /api/desafios/:id ──────────────────────────────────────────────────
// Psicologo only. Must own the desafio.
router.delete('/:id', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return res.status(400).json({ error: 'ID de desafio inválido' });
        }

        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile) {
            return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
        }

        const existing = await Desafio.findById(id);
        if (!existing) {
            return res.status(404).json({ error: 'Desafio não encontrado' });
        }
        if (existing.psicologo.toString() !== psicologoProfile._id.toString()) {
            return res.status(403).json({ error: 'Acesso negado: desafio não pertence a este psicólogo' });
        }

        await Desafio.findByIdAndDelete(id);
        res.json({ message: 'Desafio removido com sucesso' });
    } catch (error) {
        res.status(500).json({ error: (error as Error).message });
    }
});

module.exports = { desafioRoutes: router };
