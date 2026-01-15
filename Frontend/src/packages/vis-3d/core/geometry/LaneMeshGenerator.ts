// src/packages/vis-3d/core/LaneMeshGenerator.ts
import * as THREE from 'three'

export class LaneMeshGenerator {
  // 预分配最大点数 (按需调整)
  static readonly MAX_POINTS = 2000;

  /**
   * 创建一个可复用的空几何体 (预分配内存)
   */
  static createReusableGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();

    // 1. Position: 每个路径点对应左右2个顶点 (6个float)
    const positions = new Float32Array(this.MAX_POINTS * 2 * 3);
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));

    // 2. UV: 每个路径点对应左右2个UV (4个float)
    // u: 累积距离, v: 左右标识(0/1)
    const uvs = new Float32Array(this.MAX_POINTS * 2 * 2);
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2).setUsage(THREE.DynamicDrawUsage));

    // 3. Indices: 一次性生成所有可能的索引
    const indices = [];
    for (let i = 0; i < this.MAX_POINTS - 1; i++) {
      const base = i * 2;
      // 0-1-2, 2-1-3 (顺时针)
      indices.push(base, base + 1, base + 2);
      indices.push(base + 2, base + 1, base + 3);
    }
    geometry.setIndex(indices);
    geometry.setDrawRange(0, 0); // 初始不绘制
    
    // 给一个巨大的包围球，防止视锥剔除导致闪烁
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100000);
    
    return geometry;
  }

  /**
   * 极速更新几何体 (直接操作 TypedArray，零 GC)
   */
  static updateGeometry(
    geometry: THREE.BufferGeometry, 
    data: Float32Array, // 原始坐标数组 [x, y, z, ...]
    stride: number,     // 步长 (通常是3)
    count: number,      // 点数量
    width: number
  ) {
    // 保护
    const safeCount = Math.min(count, this.MAX_POINTS);
    if (safeCount < 2) {
        geometry.setDrawRange(0, 0);
        return;
    }

    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    const uvAttr = geometry.attributes.uv as THREE.BufferAttribute;
    
    const posArr = posAttr.array as Float32Array;
    const uvArr = uvAttr.array as Float32Array;

    const halfW = width * 0.5;
    let distAccumulated = 0;

    // 临时变量 (纯数值计算，不new对象)
    let currX, currY, currZ;
    let nextX, nextY;
    let dirX, dirY, len;
    let normX, normY; // 法线(右向量)

    for (let i = 0; i < safeCount; i++) {
      const idx = i * stride;
      currX = data[idx];
      currY = data[idx+1];
      currZ = stride >= 3 ? data[idx+2] : 0;

      // 1. 计算切线方向 (仅在XY平面)
      if (i < safeCount - 1) {
          const nextIdx = (i + 1) * stride;
          nextX = data[nextIdx];
          nextY = data[nextIdx+1];
          dirX = nextX - currX;
          dirY = nextY - currY;
      } else {
          // 最后一个点沿用前一个方向
          const prevIdx = (i - 1) * stride;
          dirX = currX - data[prevIdx];
          dirY = currY - data[prevIdx+1];
      }

      // 归一化
      len = Math.sqrt(dirX*dirX + dirY*dirY);
      if (len > 0.0001) {
          dirX /= len;
          dirY /= len;
      } else {
          dirX = 1; dirY = 0;
      }

      // 2. 计算右向量 (Right = Forward x Up)
      // (dx, dy, 0) x (0, 0, 1) -> (dy, -dx, 0)
      normX = dirY;
      normY = -dirX;

      // 3. 计算左右顶点
      // 左: curr - right * halfW
      const lx = currX - normX * halfW;
      const ly = currY - normY * halfW;
      
      // 右: curr + right * halfW
      const rx = currX + normX * halfW;
      const ry = currY + normY * halfW;

      // 4. 写入 Position Buffer
      const pIdx = i * 6;
      posArr[pIdx]   = lx; posArr[pIdx+1] = ly; posArr[pIdx+2] = currZ;
      posArr[pIdx+3] = rx; posArr[pIdx+4] = ry; posArr[pIdx+5] = currZ;

      // 5. 计算 UV (累积距离)
      if (i > 0) {
          const prevIdx = (i - 1) * stride;
          const dx = currX - data[prevIdx];
          const dy = currY - data[prevIdx+1];
          distAccumulated += Math.sqrt(dx*dx + dy*dy);
      }

      const uIdx = i * 4;
      uvArr[uIdx]   = distAccumulated; uvArr[uIdx+1] = 0; // 左 V=0
      uvArr[uIdx+2] = distAccumulated; uvArr[uIdx+3] = 1; // 右 V=1
    }

    posAttr.needsUpdate = true;
    uvAttr.needsUpdate = true;
    
    // 设置绘制范围
    geometry.setDrawRange(0, (safeCount - 1) * 6);
  }
}