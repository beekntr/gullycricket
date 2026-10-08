// Bump mapping from a procedural height field (Mikkelsen, "Bump Mapping Unparametrized Surfaces
// on the GPU"). Unlike three's built-in version the screen-space basis is not normalised, so with
// `height` in view-space units the slope stays physically correct at any camera distance — the
// leather grain reads the same whether the ball fills a quarter of the screen or the whole of it.
export default /* glsl */ `
vec3 perturbNormalByHeight(vec3 surfPos, vec3 surfNormal, float height, float faceDir) {
  vec3 sigmaX = dFdx(surfPos);
  vec3 sigmaY = dFdy(surfPos);
  vec3 r1 = cross(sigmaY, surfNormal);
  vec3 r2 = cross(surfNormal, sigmaX);
  float det = dot(sigmaX, r1) * faceDir;
  vec2 dHdxy = vec2(dFdx(height), dFdy(height));
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNormal - grad);
}

// 1 when a feature of the given frequency is comfortably larger than a pixel, fading to 0 before
// it would alias. pixelSize is in the same units as the feature frequency's reciprocal.
float detailFade(float pixelSize, float frequency) {
  return 1.0 - smoothstep(0.2, 0.5, pixelSize * frequency);
}
`
