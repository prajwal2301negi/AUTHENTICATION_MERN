import express from 'express';
import {config} from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import { connection } from './database/dbConnection.js';
import { errorMiddleware } from './middlewares/error.js';
import userRouter from './routes/userRouter.js';

import { removeUnverifiedAccounts } from './automation/removeUnverifiedAccounts.js';

export const app = express();

config({path: "./config.env"});

app.use(cors({
    origin: [process.env.FRONTEND_URL],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
})
);

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({extended: true}));

app.use("/api/v1/user", userRouter);
// Eg -> http://localhost:4000/api/v1/user/register


removeUnverifiedAccounts()
connection();


// Error middleware should use at end
app.use(errorMiddleware);