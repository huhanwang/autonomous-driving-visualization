// src/packages/vis-3d/core/EnvironmentManager.ts

import * as THREE from 'three';
import { ObjectType, type DecodedObject } from '@/core/protocol/VizDecoder';

export class EnvironmentManager {
  private scene: THREE.Scene;
  private objects: Map<string, THREE.Object3D> = new Map();
  private materialCache: Map<string, THREE.Material> = new Map();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public update(vizObjects: DecodedObject[]) {
    const currentIds = new Set<string>();

    vizObjects.forEach(data => {
      // 过滤掉 POLYLINE (Type 4)，交给 LaneLineManager 处理
      // 过滤掉 UNKNOWN (Type 0)
      if (data.type === ObjectType.POLYLINE || data.type === ObjectType.UNKNOWN) return;

      currentIds.add(data.id);

      if (this.objects.has(data.id)) {
        this.updateObjectTransform(this.objects.get(data.id)!, data);
      } else {
        this.createObject(data);
      }
    });

    for (const [id, mesh] of this.objects) {
      if (!currentIds.has(id)) {
        this.scene.remove(mesh);
        this.disposeMesh(mesh);
        this.objects.delete(id);
      }
    }
  }

  private createObject(data: DecodedObject) {
    let mesh: THREE.Object3D | null = null;
    const material = this.getMaterial(data.color);

    // Type 2: SPHERE (Cross Point)
    if (data.type === ObjectType.SPHERE) {
      const radius = data.size.x || 0.2;
      const geometry = new THREE.SphereGeometry(radius, 16, 16);
      mesh = new THREE.Mesh(geometry, material);
    }
    // Type 5: POLYGON (Zone / Junction)
    else if (data.type === ObjectType.POLYGON && data.points) {
      mesh = this.createPolygonMesh(data, material);
    }
    // Type 1: CUBE (Traffic Sign / Generic Object)
    else if (data.type === ObjectType.CUBE) {
      const sx = data.size.x || 1.0;
      const sy = data.size.y || 1.0;
      const sz = data.size.z || 1.0;
      const geometry = new THREE.BoxGeometry(sx, sy, sz);
      mesh = new THREE.Mesh(geometry, material);
    }
    // Type 6: MESH (Car)
    else if (data.type === ObjectType.MESH) {
        // 暂用 Box 替代，后续可换成 GLTF 模型
        const geometry = new THREE.BoxGeometry(data.size.x || 2, data.size.y || 1, data.size.z || 1);
        mesh = new THREE.Mesh(geometry, material);
    }

    if (mesh) {
      this.updateObjectTransform(mesh, data);
      mesh.userData = { id: data.id, ...data.properties };
      this.scene.add(mesh);
      this.objects.set(data.id, mesh);
    }
  }

  private createPolygonMesh(data: DecodedObject, material: THREE.Material): THREE.Object3D {
    if (!data.points || data.points.count < 3) return new THREE.Object3D();

    const raw = data.points.data;
    const stride = data.points.stride;
    const count = data.points.count;

    const shape = new THREE.Shape();
    shape.moveTo(raw[0], raw[1]);
    for (let i = 1; i < count; i++) {
      shape.lineTo(raw[i * stride], raw[i * stride + 1]);
    }
    shape.closePath();

    const height = data.size?.z || 0;
    let geometry: THREE.BufferGeometry;

    if (height > 0.1) {
      geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    } else {
      geometry = new THREE.ShapeGeometry(shape);
    }

    const mesh = new THREE.Mesh(geometry, material);
    
    // Z 轴偏移：防止平面 Z-fighting
    const zBase = raw[2] || 0;
    if (height <= 0.1) {
      mesh.position.set(0, 0, zBase + 0.02); 
    } else {
      mesh.position.set(0, 0, zBase);
    }

    return mesh;
  }

  private updateObjectTransform(mesh: THREE.Object3D, data: DecodedObject) {
    if (data.type !== ObjectType.POLYGON) {
      if (data.position) {
        mesh.position.set(data.position.x, data.position.y, data.position.z);
      }
    }
    if (data.rotation) {
      mesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
    }
  }

  private getMaterial(color: {r: number, g: number, b: number, a: number}): THREE.Material {
    const key = `${color.r}-${color.g}-${color.b}-${color.a}`;
    if (this.materialCache.has(key)) return this.materialCache.get(key)!;

    const colorHex = (color.r << 16) | (color.g << 8) | color.b;
    const opacity = color.a / 255;

    const material = new THREE.MeshLambertMaterial({
      color: colorHex,
      transparent: opacity < 0.95,
      opacity: opacity,
      side: THREE.DoubleSide
    });

    this.materialCache.set(key, material);
    return material;
  }

  private disposeMesh(mesh: THREE.Object3D) {
    if (mesh instanceof THREE.Mesh) mesh.geometry.dispose();
  }
  
  public clear() {
    for (const mesh of this.objects.values()) {
      this.scene.remove(mesh);
      this.disposeMesh(mesh);
    }
    this.objects.clear();
    this.materialCache.clear();
  }
}