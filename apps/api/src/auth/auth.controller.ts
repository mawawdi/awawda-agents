import { Body, Controller, Get, Headers, Inject, Post, UnauthorizedException } from '@nestjs/common';

import { LoginAgentDto } from './dto/login-agent.dto';
import { AuthService, type LoginResponse } from './auth.service';

@Controller({
  path: 'agent/auth',
  version: '1',
})
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() input: LoginAgentDto): LoginResponse {
    return this.authService.login(input);
  }

  @Get('session')
  getSession(@Headers('authorization') authHeader?: string) {
    return {
      agentProfile: this.authService.getSession(this.extractBearerToken(authHeader)),
    };
  }

  @Post('logout')
  logout(@Headers('authorization') authHeader?: string) {
    this.authService.logout(this.extractBearerToken(authHeader));
    return { success: true };
  }

  private extractBearerToken(authHeader?: string): string {
    const [scheme, token] = authHeader?.trim().split(' ') ?? [];
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Authorization header with Bearer token is required.');
    }

    return token;
  }
}
