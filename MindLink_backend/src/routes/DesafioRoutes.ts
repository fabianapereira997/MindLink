import { Request, Response } from 'express';
import {
    getPsicologoByUserId,
    getPacienteByUserId,
    isPsicologoAssignedToPaciente,
    isValidObjectId,
} from '../utils/helpers';

const express = require('express');
const mongoose = require('mongoose');
const router  = express.Router();
const Desafio = require('../models/desafio');
const Paciente = require('../models/paciente');

// ─── helpers ────────────────────────────────────────────────────────────────
function getDateRangeForDuracao(duracao: string): { data_inicio: Date; data_fim: Date } {
    const now = new Date();

    if (duracao === 'semanal') {
        // O paciente tem uma semana a partir do momento em que o desafio é definido.
        const inicio = new Date(now);
        const fim = new Date(now);
        fim.setDate(fim.getDate() + 7);
        return { data_inicio: inicio, data_fim: fim };
    }

    if (duracao === 'mensal') {
        const inicio = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
        const fim = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        return { data_inicio: inicio, data_fim: fim };
    }

    // diario (default)
    const inicio = new Date(now);
    inicio.setHours(0, 0, 0, 0);
    const fim = new Date(now);
    fim.setHours(23, 59, 59, 999);
    return { data_inicio: inicio, data_fim: fim };
}
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

        const { paciente, pacientes, titulo, descricao, tipo, duracao, data_inicio, data_fim, sugestao, respostaObrigatoria } = req.body;
        const respostaObrigatoriaFinal = respostaObrigatoria === true;

        // ─── New format: one challenge → multiple pacientes ────────────────────
        if (Array.isArray(pacientes)) {
            if (!pacientes.length) {
                return res.status(400).json({ error: 'Selecione pelo menos um paciente' });
            }
            for (const pid of pacientes) {
                if (!isValidObjectId(pid)) {
                    return res.status(400).json({ error: 'ID de paciente inválido' });
                }
                const assigned = await isPsicologoAssignedToPaciente(req.user!.id, pid);
                if (!assigned) {
                    return res.status(403).json({ error: 'Acesso negado: paciente não associado a este psicólogo' });
                }
            }

            const tipoFinal = duracao || tipo || 'diario';
            const { data_inicio: inicio, data_fim: fim } = getDateRangeForDuracao(tipoFinal);
            const grupo = new mongoose.Types.ObjectId();

            const docs = await Desafio.insertMany(pacientes.map((pid: string) => ({
                paciente: pid,
                psicologo: psicologoProfile._id,
                titulo,
                descricao: descricao || ' ',
                tipo: tipoFinal,
                data_inicio: inicio,
                data_fim: fim,
                sugestao,
                respostaObrigatoria: respostaObrigatoriaFinal,
                grupo,
            })));

            const pacientesPopulados = await Paciente.find({ _id: { $in: pacientes } })
                .populate('user', 'nome email');

            return res.status(201).json({
                _id: grupo,
                grupo,
                titulo,
                descricao,
                duracao: tipoFinal,
                tipo: tipoFinal,
                data_inicio: inicio,
                data_fim: fim,
                estado: 'pendente',
                respostaObrigatoria: respostaObrigatoriaFinal,
                createdAt: docs[0]?.createdAt,
                pacientesCumpriram: [],
                pacientesPendentes: pacientesPopulados,
                pacientesNaoCumpriram: [],
            });
        }

        // ─── Legacy format: one challenge → one paciente ────────────────────────
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
            respostaObrigatoria: respostaObrigatoriaFinal,
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

// ─── GET /api/desafios/psicologo — alias for logged-in psicologo ──────────────
// Returns all desafios created by the authenticated psicologo. Must come before /:id.
router.get('/psicologo', verifyToken, verifyTokenByRole('psicologo'), async (req: Request, res: Response) => {
    try {
        const psicologoProfile = await getPsicologoByUserId(req.user!.id);
        if (!psicologoProfile) {
            return res.status(404).json({ error: 'Perfil de psicólogo não encontrado' });
        }
        const desafios = await Desafio.find({ psicologo: psicologoProfile._id })
            .populate({ path: 'paciente', populate: { path: 'user', select: 'nome email' } })
            .populate({ path: 'psicologo', populate: { path: 'user', select: 'nome email' } })
            .sort({ createdAt: -1 });

        // Group desafios that were created together (shared "grupo") into a single
        // entry with pacientesCumpriram / pacientesNaoCumpriram lists. Desafios
        // without a "grupo" (legacy, single-paciente) form their own group.
        const grupos = new Map<string, any>();

        for (const d of desafios) {
            const key = d.grupo ? d.grupo.toString() : d._id.toString();

            if (!grupos.has(key)) {
                grupos.set(key, {
                    _id: key,
                    titulo: d.titulo,
                    descricao: d.descricao,
                    duracao: d.tipo,
                    tipo: d.tipo,
                    data_inicio: d.data_inicio,
                    data_fim: d.data_fim,
                    estado: d.estado,
                    respostaObrigatoria: d.respostaObrigatoria ?? false,
                    createdAt: d.createdAt,
                    psicologo: d.psicologo,
                    pacientesCumpriram: [] as any[],
                    pacientesPendentes: [] as any[],
                    pacientesNaoCumpriram: [] as any[],
                });
            }

            const grupoEntry = grupos.get(key);
            if (d.paciente) {
                if (d.estado === 'concluido') {
                    grupoEntry.pacientesCumpriram.push({
                        ...d.paciente.toObject(),
                        comentario: d.comentario ?? null,
                        resposta: d.resposta ?? null,
                    });
                } else {
                    // Ainda dentro do prazo (data_fim) → pendente; passou o prazo → não cumpriu.
                    const prazoExpirado = d.data_fim ? new Date(d.data_fim).getTime() < Date.now() : false;
                    if (prazoExpirado) {
                        grupoEntry.pacientesNaoCumpriram.push(d.paciente);
                    } else {
                        grupoEntry.pacientesPendentes.push(d.paciente);
                    }
                }
            }
        }

        res.json(Array.from(grupos.values()));
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
            const { estado, comentario, resposta } = req.body;
            if (estado !== 'concluido') {
                return res.status(403).json({ error: 'Paciente só pode marcar desafio como "concluido"' });
            }

            const respostaTrimmed = typeof resposta === 'string' ? resposta.trim() : '';
            if (desafio.respostaObrigatoria && !respostaTrimmed) {
                return res.status(400).json({ error: 'Este desafio exige uma resposta escrita.' });
            }

            desafio.estado = 'concluido';
            if (comentario !== undefined) {
                const trimmed = typeof comentario === 'string' ? comentario.trim() : '';
                desafio.comentario = trimmed || null;
            }
            if (resposta !== undefined) {
                desafio.resposta = respostaTrimmed || null;
            }
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
