import { describe, expect, it } from 'vitest';

import { classifyOutboundBounceFailure } from '../outbound-bounce-classifier.service.js';

describe('classifyOutboundBounceFailure', () => {
  it('classifies invalid recipient errors as permanent bounces', () => {
    const result = classifyOutboundBounceFailure(
      new Error('550-5.1.1 The email account that you tried to reach does not exist. RFC 5321')
    );

    expect(result).toEqual({
      isBounce: true,
      message: '550-5.1.1 The email account that you tried to reach does not exist. RFC 5321',
    });
  });

  it('does not classify transient provider failures as bounces', () => {
    const result = classifyOutboundBounceFailure(new Error('ECONNRESET while contacting provider'));

    expect(result).toEqual({
      isBounce: false,
      message: 'ECONNRESET while contacting provider',
    });
  });
});
