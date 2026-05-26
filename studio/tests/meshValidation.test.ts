import { describe, it, expect } from "vitest";
import { validateMesh, type MeshData } from "../client/src/utils/meshModifiers";

function makeTetrahedron(): MeshData {
  const positions = new Float64Array([
    0, 1, 0,
    -1, -1, 1,
    1, -1, 1,
    0, -1, -1,
  ]);
  const indices = new Uint32Array([
    0, 1, 2,
    0, 2, 3,
    0, 3, 1,
    1, 3, 2,
  ]);
  const normals = new Float64Array(12);
  return { positions, normals, indices, vertexCount: 4, triCount: 4 };
}

function makeOpenMesh(): MeshData {
  // A single triangle — 3 boundary edges out of 3 total = 100% boundary
  const positions = new Float64Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
  ]);
  const indices = new Uint32Array([0, 1, 2]);
  const normals = new Float64Array(9);
  return { positions, normals, indices, vertexCount: 3, triCount: 1 };
}

function makeHeavilyOpenMesh(): MeshData {
  // Start with an icosahedron-like closed mesh, then remove ~half the faces
  // to simulate the broken generation case
  const positions = new Float64Array([
    0, 1, 0,    // 0 - top
    0, -1, 0,   // 1 - bottom
    1, 0, 0,    // 2
    -1, 0, 0,   // 3
    0, 0, 1,    // 4
    0, 0, -1,   // 5
  ]);
  // An octahedron has 8 faces. Keep only 3 of them — ~60% removed
  const indices = new Uint32Array([
    0, 2, 4,   // top-front-right
    0, 4, 3,   // top-front-left
    0, 3, 5,   // top-back-left
  ]);
  const normals = new Float64Array(18);
  return { positions, normals, indices, vertexCount: 6, triCount: 3 };
}

describe("Mesh validation — boundary edge check", () => {
  it("accepts a closed tetrahedron (0 boundary edges)", () => {
    const mesh = makeTetrahedron();
    const result = validateMesh(mesh);
    expect(result.valid).toBe(true);
  });

  it("rejects a single triangle (100% boundary)", () => {
    const mesh = makeOpenMesh();
    const result = validateMesh(mesh);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not closed");
  });

  it("rejects a heavily open mesh (>60% faces removed)", () => {
    const mesh = makeHeavilyOpenMesh();
    const result = validateMesh(mesh);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("not closed");
  });

  it("accepts a closed octahedron (0 boundary edges)", () => {
    // Build a mesh where boundary ratio is just under 8%
    // A closed octahedron (8 faces, 12 edges, 6 vertices)
    const positions = new Float64Array([
      0, 1, 0,    // 0
      0, -1, 0,   // 1
      1, 0, 0,    // 2
      -1, 0, 0,   // 3
      0, 0, 1,    // 4
      0, 0, -1,   // 5
    ]);
    const indices = new Uint32Array([
      0, 2, 4,
      0, 4, 3,
      0, 3, 5,
      0, 5, 2,
      1, 4, 2,
      1, 3, 4,
      1, 5, 3,
      1, 2, 5,
    ]);
    const normals = new Float64Array(18);
    const mesh: MeshData = { positions, normals, indices, vertexCount: 6, triCount: 8 };
    const result = validateMesh(mesh);
    expect(result.valid).toBe(true);
  });
});

describe("Mesh validation — volume consistency (self-intersection)", () => {
  it("accepts a well-formed tetrahedron (ratio ~1.0)", () => {
    const positions = new Float64Array([
      0, 1, 0,
      -1, -1, 1,
      1, -1, 1,
      0, -1, -1,
    ]);
    const indices = new Uint32Array([
      0, 1, 2,
      0, 2, 3,
      0, 3, 1,
      1, 3, 2,
    ]);
    const normals = new Float64Array(12);
    const mesh: MeshData = { positions, normals, indices, vertexCount: 4, triCount: 4 };
    const result = validateMesh(mesh);
    expect(result.valid).toBe(true);
  });

  it("rejects a crumpled mesh (faces folded inward)", () => {
    // Create a closed mesh where half the faces are flipped inward
    // Octahedron with 4 faces having correct winding and 4 inverted
    const positions = new Float64Array([
      0, 1, 0,    // 0 top
      0, -1, 0,   // 1 bottom
      1, 0, 0,    // 2
      -1, 0, 0,   // 3
      0, 0, 1,    // 4
      0, 0, -1,   // 5
    ]);
    // Normal octahedron winding for top 4 faces, REVERSED winding for bottom 4
    const indices = new Uint32Array([
      0, 2, 4,   // correct
      0, 4, 3,   // correct
      0, 3, 5,   // correct
      0, 5, 2,   // correct
      1, 2, 4,   // REVERSED (should be 1,4,2)
      1, 4, 3,   // REVERSED (should be 1,3,4)
      1, 3, 5,   // REVERSED (should be 1,5,3)
      1, 5, 2,   // REVERSED (should be 1,2,5)
    ]);
    const normals = new Float64Array(18);
    const mesh: MeshData = { positions, normals, indices, vertexCount: 6, triCount: 8 };
    const result = validateMesh(mesh);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("self-intersecting");
  });

  it("accepts octahedron with all correct winding", () => {
    const positions = new Float64Array([
      0, 1, 0,
      0, -1, 0,
      1, 0, 0,
      -1, 0, 0,
      0, 0, 1,
      0, 0, -1,
    ]);
    const indices = new Uint32Array([
      0, 2, 4,
      0, 4, 3,
      0, 3, 5,
      0, 5, 2,
      1, 4, 2,
      1, 3, 4,
      1, 5, 3,
      1, 2, 5,
    ]);
    const normals = new Float64Array(18);
    const mesh: MeshData = { positions, normals, indices, vertexCount: 6, triCount: 8 };
    const result = validateMesh(mesh);
    expect(result.valid).toBe(true);
  });
});
