import { Body, Controller, Post } from '@nestjs/common';
import type { AgentLoginResponse } from '@meatland/shared-types';

import { AgentLoginRequestDto } from './dto/agent-login-request.dto';
import { AuthService } from './auth.service';

@Controller({ path: 'agent/auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() loginRequest: AgentLoginRequestDto): Promise<AgentLoginResponse> {
    return this.authService.login(loginRequest);
  }
}
