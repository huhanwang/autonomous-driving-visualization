// src/packages/vis-3d/core/materials/LaneShaders.ts

const fogParsFragment = `
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uFogHeightFalloff;
  uniform float uFogHeightBias;
  
  float getHeightFogFactor(float dist, float worldZ) {
    float fogDist = 1.0 - exp(-dist * uFogDensity);
    float heightFactor = exp(-uFogHeightFalloff * (worldZ - uFogHeightBias));
    heightFactor = clamp(heightFactor, 0.0, 1.0);
    return clamp(fogDist * 0.7 + heightFactor * 0.3 * fogDist, 0.0, 1.0);
  }
`

export const LaneShaders = {
  vertexShader: `
    varying vec2 vUv;
    varying float vDistLine;
    varying float vCamDist;
    varying vec3 vWorldPos;
    
    void main() {
      vUv = uv;
      vDistLine = uv.x;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPos = worldPosition.xyz;
      vCamDist = distance(cameraPosition, worldPosition.xyz);
      gl_Position = projectionMatrix * viewMatrix * worldPosition;
    }
  `,

  fragmentShader: `
    uniform vec3 color;
    uniform int uType;
    uniform float dashSize;
    uniform float ratio;
    ${fogParsFragment}
    
    varying vec2 vUv;
    varying float vDistLine;
    varying float vCamDist;
    varying vec3 vWorldPos;

    void main() {
      float alpha = 1.0;
      float t = vDistLine / dashSize;
      float cycle = fract(t);
      float fw = fwidth(t); 
      float dashAlpha = 1.0 - smoothstep(ratio - fw, ratio + fw, cycle);
      float y = vUv.y;
      float fy = fwidth(y);
      float edgeAlpha = smoothstep(0.0, fy, y) * smoothstep(1.0, 1.0 - fy, y);
      
      if (uType == 1) {
        alpha *= dashAlpha;
      } else if (uType >= 2) {
        float centerGap = smoothstep(0.35 - fy, 0.35, y) * smoothstep(0.65 + fy, 0.65, y);
        float isDouble = 1.0 - centerGap;
        alpha *= isDouble;
        if (uType == 3) alpha *= dashAlpha;
        else if (uType == 4) alpha *= mix(1.0, dashAlpha, step(0.5, y));
        else if (uType == 5) alpha *= mix(1.0, dashAlpha, 1.0 - step(0.5, y));
      }
      
      alpha *= edgeAlpha;
      if (alpha < 0.05) discard;
      
      float fogFactor = getHeightFogFactor(vCamDist, vWorldPos.z);
      vec3 renderColor = color * 1.2;
      vec3 finalColor = mix(renderColor, uFogColor, fogFactor);
      float fadeAlpha = 1.0 - smoothstep(1500.0, 3000.0, vCamDist);
      
      gl_FragColor = vec4(finalColor, alpha * fadeAlpha);
    }
  `
}