/**
 * Build of the Android app, such as "1.0.15", matching the version Android shows
 * under App info. Empty in the web build, which always serves the latest code.
 */
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? "";
