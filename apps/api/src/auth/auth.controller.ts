import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { AgentLoginResponse, AgentRefreshResponse } from '@awawda/shared-types';

import { AgentLoginRequestDto } from './dto/agent-login-request.dto';
import { AuthService } from './auth.service';

class RefreshTokenBodyDto {
  refreshToken!: string;
}

class LogoutBodyDto {
  refreshToken!: string;
}

@ApiTags('auth')
@Controller({ path: 'agent/auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  login(@Body() loginRequest: AgentLoginRequestDto): Promise<AgentLoginResponse> {
    return this.authService.login(loginRequest);
  }

  @Post('refresh')
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  refresh(@Body() body: RefreshTokenBodyDto): Promise<AgentRefreshResponse> {
    return this.authService.refresh(body.refreshToken ?? '');
  }

  @Post('logout')
  @UseGuards(ThrottlerGuard)
  @Throttle({ auth: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  async logout(@Body() body: LogoutBodyDto): Promise<{ ok: boolean }> {
    await this.authService.logout(body.refreshToken ?? '');
    return { ok: true };
  }
}
