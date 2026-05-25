import { utilities as nestWinstonModuleUtilities, WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { requestContext } from '../common/request-context';

const requestIdFormat = winston.format((info) => {
  const requestId = requestContext.getStore()?.requestId;
  if (requestId && typeof info.message === 'string') {
    info.message = `[${requestId}] ${info.message}`;
  }
  return info;
});

export const winstonConfig = {
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        requestIdFormat(),
        winston.format.timestamp(),
        nestWinstonModuleUtilities.format.nestLike('CompaniiAPI', {
          colors: true,
          prettyPrint: process.env.NODE_ENV !== 'production',
        }),
      ),
    }),
  ],
};

export { WinstonModule };
