/**
 * Shader Infrastructure - GLSL shaders for casino effects
 */

// Lightning shaders (Lightning Roulette)
export {
  lightningVertexShader,
  lightningFragmentShader,
  type LightningUniforms,
  createLightningUniforms,
  createLightningMaterial,
  numberHighlightVertexShader,
  numberHighlightFragmentShader,
  type NumberHighlightUniforms,
  createNumberHighlightUniforms,
  createNumberHighlightMaterial,
  electricArcFragmentShader,
} from './LightningShader';

// Squeeze shaders (Baccarat)
export {
  squeezeVertexShader,
  squeezeFragmentShader,
  type SqueezeUniforms,
  createSqueezeUniforms,
  createSqueezeMaterial,
  cornerPeekVertexShader,
  cornerPeekFragmentShader,
  type CornerPeekUniforms,
  createCornerPeekUniforms,
  createCornerPeekMaterial,
} from './SqueezeShader';
