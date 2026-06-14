// Vite type augmentations for the WXT/Vite build.

declare module '*.css?inline' {
  const content: string
  export default content
}
