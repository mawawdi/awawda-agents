import "reflect-metadata"

import { ValidationPipe, VersioningType } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"

import { AppModule } from "./app.module"
import { assertProductionRuntimeGuardrails, isNodeProductionRuntime } from "./runtime/production-guardrails"

const DEFAULT_API_BODY_LIMIT_BYTES = 1024 * 1024

const DEFAULT_CORS_ALLOWED_ORIGINS = [
	"http://localhost:8080",
	"http://127.0.0.1:8080",
	"http://localhost:8081",
	"http://127.0.0.1:8081",
	"exp://10.0.0.25:8081",
	"http://127.0.0.1:3000",
]

const CORS_ALLOWED_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
const CORS_ALLOWED_HEADERS = [
	"Authorization",
	"Content-Type",
	"Accept",
	"Origin",
	"X-Requested-With",
	"X-Agent-Id",
	"Idempotency-Key",
	"X-Request-Id",
]

function resolveCorsAllowedOrigins(): Set<string> {
	const rawValue = process.env.CORS_ALLOWED_ORIGINS
	const configuredOrigins = rawValue
		?.split(",")
		.map((origin) => origin.trim())
		.filter((origin) => origin.length > 0)

	// In production, CORS must be configured explicitly. Never fall back to the localhost dev
	// defaults (they would answer credentialed requests from local origins), and treat an
	// explicitly-set-but-empty value as deny-all rather than reverting to those defaults.
	if (isNodeProductionRuntime()) {
		if (rawValue === undefined) {
			throw new Error(
				"Production runtime requires CORS_ALLOWED_ORIGINS to be set explicitly (a comma-separated origin allowlist).",
			)
		}

		return new Set(configuredOrigins ?? [])
	}

	if (configuredOrigins && configuredOrigins.length > 0) {
		return new Set(configuredOrigins)
	}

	return new Set(DEFAULT_CORS_ALLOWED_ORIGINS)
}

function resolveApiBodyLimit(): number {
	const configuredLimit = Number(process.env.API_BODY_LIMIT_BYTES)
	if (Number.isInteger(configuredLimit) && configuredLimit > 0) {
		return configuredLimit
	}

	return DEFAULT_API_BODY_LIMIT_BYTES
}

export async function createApiApp(): Promise<NestFastifyApplication> {
	assertProductionRuntimeGuardrails()

	const app = await NestFactory.create<NestFastifyApplication>(
		AppModule,
		new FastifyAdapter({
			bodyLimit: resolveApiBodyLimit(),
		}),
	)
	const allowedOrigins = resolveCorsAllowedOrigins()
	const fastify = app.getHttpAdapter().getInstance()

	fastify.addHook(
		"onSend",
		async (_request: unknown, reply: { header(name: string, value: string): void }, payload: unknown) => {
			reply.header("x-content-type-options", "nosniff")
			reply.header("x-frame-options", "DENY")
			reply.header("referrer-policy", "no-referrer")
			reply.header("permissions-policy", "camera=(), microphone=(), geolocation=()")
			reply.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
			return payload
		},
	)

	fastify.addHook(
		"onRequest",
		async (request, reply) => {
			const incomingId = request.headers["x-request-id"]
			const requestId = typeof incomingId === "string" ? incomingId : crypto.randomUUID()
			request.id = requestId
			void reply.header("x-request-id", requestId)
		},
	)

	app.enableCors({
		origin: (origin, callback) => {
			if (!origin || allowedOrigins.has(origin)) {
				callback(null, true)
				return
			}

			callback(new Error(`Origin ${origin} is not allowed by CORS`), false)
		},
		methods: CORS_ALLOWED_METHODS,
		allowedHeaders: CORS_ALLOWED_HEADERS,
		credentials: true,
		maxAge: 600,
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

	if (process.env.SWAGGER_ENABLED === "true") {
		const config = new DocumentBuilder()
			.setTitle("Awawda Agents API")
			.setDescription("Internal API for agent mobile app, customer portal, and supervisor dashboard")
			.setVersion("1.0")
			.addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" })
			.addSecurityRequirements("bearer")
			.build()

		const document = SwaggerModule.createDocument(app, config)
		SwaggerModule.setup("api-docs", app, document, {
			swaggerOptions: { persistAuthorization: true },
		})
	}

	return app
}
