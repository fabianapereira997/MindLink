import { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';

export const errorHandler = (
    err: Error & { code?: number; value?: unknown; errors?: unknown },
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    if (err instanceof MongooseError.ValidationError || err.name === 'ValidationError') {
        res.status(400).json({ error: err.message });
        return;
    }
    if (err instanceof MongooseError.CastError || err.name === 'CastError') {
        res.status(400).json({ error: `ID inválido: ${(err as MongooseError.CastError).value}` });
        return;
    }
    if (err.code === 11000) {
        res.status(409).json({ error: 'Registo duplicado' });
        return;
    }
    console.error(err);
    res.status(500).json({ error: err.message || 'Erro interno do servidor' });
};
