import "reflect-metadata"

import { ValidationPipe, VersioningType } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify"

import { AppModule } from "./app.module"

const DEFAULT_CORS_ALLOWED_ORIGINS = [
	"http://localhost:8080",
	"http://127.0.0.1:8080",
	"http://localhost:8081",
	"http://127.0.0.1:8081",
	"exp://10.0.0.25:8081",
]

function resolveCorsAllowedOrigins(): Set<string> {
	const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS?.split(",")
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0)

	if (configuredOrigins && configuredOrigins.length > 0) {
		return new Set(configuredOrigins)
	}

	return new Set(DEFAULT_CORS_ALLOWED_ORIGINS)
}

export async function createApiApp(): Promise<NestFastifyApplication> {
	const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())
	const allowedOrigins = resolveCorsAllowedOrigins()

	app.enableCors({
		origin: (origin, callback) => {
			if (!origin || allowedOrigins.has(origin)) {
				callback(null, true)
				return
			}

			callback(new Error(`Origin ${origin} is not allowed by CORS`), false)
		},
		credentials: true,
	})

	app.enableVersioning({
		type: VersioningType.URI,
		prefix: "v",
	})

	app.useGlobalPipes(
		new ValidationPipe({
			whitelist: true,
			transform: true,
			forbidNonWhitelisted: true,
			transformOptions: {
				enableImplicitConversion: true,
			},
		}),
	)

	app.enableShutdownHooks()

	return app
}
