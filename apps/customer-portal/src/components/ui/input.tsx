import * as React from 'react';

import { cn } from '../../lib/cn';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type = 'text', ...props }, ref) => {
  return <input className={cn('ui-input', className)} ref={ref} type={type} {...props} />;
});
Input.displayName = 'Input';

export { Input };
