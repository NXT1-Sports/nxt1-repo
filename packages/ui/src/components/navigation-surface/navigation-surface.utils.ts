/**
 * Shared navigation surface helpers for header/footer components.
 */

export interface NavigationSurfaceOptions {
  readonly translucent?: boolean;
  readonly glass?: boolean;
}

export interface NavigationSurfaceState {
  readonly glass: boolean;
  readonly translucent: boolean;
  readonly mode: 'solid' | 'translucent' | 'glass';
}

export function resolveNavigationSurfaceState(
  config: NavigationSurfaceOptions,
  platform: string
): NavigationSurfaceState {
  const glass = config.glass === true;
  const translucent =
    config.translucent !== false && (platform === 'ios' || config.translucent === true);

  if (glass) {
    return {
      glass: true,
      translucent,
      mode: 'glass',
    };
  }

  if (translucent) {
    return {
      glass: false,
      translucent: true,
      mode: 'translucent',
    };
  }

  return {
    glass: false,
    translucent: false,
    mode: 'solid',
  };
}
