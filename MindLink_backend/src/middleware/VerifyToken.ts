import { Request, Response, NextFunction } from 'express';
import jwt = require('jsonwebtoken');

export const verifyToken = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // expects "Bearer <token>"

    if (!token) {
        res.status(401).json({ error: 'Token não fornecido' });
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; tipo: string };
        req.user = decoded;
        next();
    } catch {
        res.status(401).json({ error: 'Token inválido ou expirado' });
    }
};
