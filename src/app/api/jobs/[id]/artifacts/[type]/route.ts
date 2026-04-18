import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

interface RouteParams {
  params: Promise<{ id: string; type: string }>;
}

const VALID_ARTIFACT_TYPES = ["stl", "png", "scad"];

// Generate a minimal binary STL for a simple box (for simulation)
function generateMockStlContent(width: number, depth: number, height: number): Buffer {
  // Minimal STL binary header (80 bytes) + triangle count (4 bytes)
  // For a simple box we need 12 triangles (6 faces, 2 triangles each)
  const header = Buffer.alloc(80, 0);
  header.write("AgentSCAD Generated STL", 0, "ascii");

  const numTriangles = 12;
  const triangleCount = Buffer.alloc(4);
  triangleCount.writeUInt32LE(numTriangles, 0);

  const halfW = width / 2;
  const halfD = depth / 2;
  const halfH = height / 2;

  // Define the 8 vertices of a box
  const vertices: [number, number, number][] = [
    [-halfW, -halfD, -halfH], // 0
    [+halfW, -halfD, -halfH], // 1
    [+halfW, +halfD, -halfH], // 2
    [-halfW, +halfD, -halfH], // 3
    [-halfW, -halfD, +halfH], // 4
    [+halfW, -halfD, +halfH], // 5
    [+halfW, +halfD, +halfH], // 6
    [-halfW, +halfD, +halfH], // 7
  ];

  // 12 triangles (6 faces × 2 triangles)
  const faceIndices: [number, number, number, number][] = [
    // Bottom face (z = -halfH), normal (0, 0, -1)
    [0, 0, -1, 0, 2, 1],
    [0, 0, -1, 0, 3, 2],
    // Top face (z = +halfH), normal (0, 0, +1)
    [0, 0, 1, 4, 5, 6],
    [0, 0, 1, 4, 6, 7],
    // Front face (y = -halfD), normal (0, -1, 0)
    [0, -1, 0, 0, 1, 5],
    [0, -1, 0, 0, 5, 4],
    // Back face (y = +halfD), normal (0, +1, 0)
    [0, 1, 0, 2, 3, 7],
    [0, 1, 0, 2, 7, 6],
    // Left face (x = -halfW), normal (-1, 0, 0)
    [-1, 0, 0, 0, 4, 7],
    [-1, 0, 0, 0, 7, 3],
    // Right face (x = +halfW), normal (+1, 0, 0)
    [1, 0, 0, 1, 2, 6],
    [1, 0, 0, 1, 6, 5],
  ];

  const triangles: Buffer[] = [];

  for (const [nx, ny, nz, i0, i1, i2] of faceIndices) {
    // Each triangle: normal (3 × float32) + 3 vertices (9 × float32) + attribute byte count (uint16)
    const tri = Buffer.alloc(50); // 12 + 36 + 2 = 50 bytes
    let offset = 0;

    // Normal
    tri.writeFloatLE(nx, offset); offset += 4;
    tri.writeFloatLE(ny, offset); offset += 4;
    tri.writeFloatLE(nz, offset); offset += 4;

    // Vertex 1
    tri.writeFloatLE(vertices[i0][0], offset); offset += 4;
    tri.writeFloatLE(vertices[i0][1], offset); offset += 4;
    tri.writeFloatLE(vertices[i0][2], offset); offset += 4;

    // Vertex 2
    tri.writeFloatLE(vertices[i1][0], offset); offset += 4;
    tri.writeFloatLE(vertices[i1][1], offset); offset += 4;
    tri.writeFloatLE(vertices[i1][2], offset); offset += 4;

    // Vertex 3
    tri.writeFloatLE(vertices[i2][0], offset); offset += 4;
    tri.writeFloatLE(vertices[i2][1], offset); offset += 4;
    tri.writeFloatLE(vertices[i2][2], offset); offset += 4;

    // Attribute byte count
    tri.writeUInt16LE(0, offset);

    triangles.push(tri);
  }

  return Buffer.concat([header, triangleCount, ...triangles]);
}

// Generate mock PNG as a simple 1x1 pixel image (placeholder)
function generateMockPngContent(): Buffer {
  // Minimal valid PNG: 1x1 white pixel
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(1, 0); // width
  ihdrData.writeUInt32BE(1, 4); // height
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace

  const ihdrType = Buffer.from("IHDR", "ascii");
  const ihdrCrc = crc32(Buffer.concat([ihdrType, ihdrData]));
  const ihdrCrcBuf = Buffer.alloc(4);
  ihdrCrcBuf.writeUInt32BE(ihdrCrc >>> 0, 0);
  const ihdrLength = Buffer.alloc(4);
  ihdrLength.writeUInt32BE(13, 0);
  const ihdr = Buffer.concat([ihdrLength, ihdrType, ihdrData, ihdrCrcBuf]);

  // IDAT chunk (compressed 1x1 white pixel)
  // Raw data: filter byte (0) + R G B (255 255 255)
  // Compressed with deflate (stored block)
  const rawRow = Buffer.from([0, 255, 255, 255]); // filter=none + RGB
  const idatData = deflateStore(rawRow);
  const idatType = Buffer.from("IDAT", "ascii");
  const idatCrc = crc32(Buffer.concat([idatType, idatData]));
  const idatCrcBuf = Buffer.alloc(4);
  idatCrcBuf.writeUInt32BE(idatCrc >>> 0, 0);
  const idatLength = Buffer.alloc(4);
  idatLength.writeUInt32BE(idatData.length, 0);
  const idat = Buffer.concat([idatLength, idatType, idatData, idatCrcBuf]);

  // IEND chunk
  const iendType = Buffer.from("IEND", "ascii");
  const iendCrc = crc32(iendType);
  const iendCrcBuf = Buffer.alloc(4);
  iendCrcBuf.writeUInt32BE(iendCrc >>> 0, 0);
  const iendLength = Buffer.alloc(4);
  iendLength.writeUInt32BE(0, 0);
  const iend = Buffer.concat([iendLength, iendType, iendCrcBuf]);

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// Simple deflate stored block (no compression, just wraps in zlib format)
function deflateStore(data: Buffer): Buffer {
  // zlib header (2 bytes) + stored block header (5 bytes) + data + adler32 (4 bytes)
  const zlibHeader = Buffer.from([0x78, 0x01]); // zlib header (deflate, level 1)

  // Stored block: BFINAL=1, BTYPE=00
  const blockLen = data.length;
  const blockHeader = Buffer.alloc(5);
  blockHeader[0] = 0x01; // BFINAL=1, BTYPE=00 (stored)
  blockHeader.writeUInt16LE(blockLen, 1);
  blockHeader.writeUInt16LE(~blockLen & 0xffff, 3);

  // Adler-32 checksum
  const adler = adler32(data);
  const adlerBuf = Buffer.alloc(4);
  adlerBuf.writeUInt32BE(adler >>> 0, 0);

  return Buffer.concat([zlibHeader, blockHeader, data, adlerBuf]);
}

function adler32(data: Buffer): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + data[i]) % 65521;
    b = (b + a) % 65521;
  }
  return (b << 16) | a;
}

// CRC32 lookup table
const crcTable = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ 0xffffffff;
}

/**
 * GET /api/jobs/[id]/artifacts/[type]
 * Download artifact (stl, png, scad) for a job
 */
export async function GET(
  _request: NextRequest,
  { params }: RouteParams
) {
  try {
    const { id, type } = await params;

    if (!VALID_ARTIFACT_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `Invalid artifact type: ${type}. Valid types: ${VALID_ARTIFACT_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    const job = await db.job.findUnique({ where: { id } });

    if (!job) {
      return NextResponse.json(
        { error: `Job not found with id: ${id}` },
        { status: 404 }
      );
    }

    // Check if the artifact is available based on job state
    const minStates: Record<string, string[]> = {
      scad: ["SCAD_GENERATED", "RENDERED", "VALIDATED", "DELIVERED"],
      stl: ["RENDERED", "VALIDATED", "DELIVERED"],
      png: ["RENDERED", "VALIDATED", "DELIVERED"],
    };

    if (!minStates[type].includes(job.state)) {
      return NextResponse.json(
        {
          error: `Artifact '${type}' not available in job state '${job.state}'. ` +
            `Job must be in one of: ${minStates[type].join(", ")}`,
          currentState: job.state,
          requiredStates: minStates[type],
        },
        { status: 404 }
      );
    }

    // Parse parameter values for generating mock content
    let paramValues: Record<string, number> = { width: 40, depth: 30, height: 15, wall_thickness: 2.0 };
    if (job.parameterValues) {
      try {
        paramValues = { ...paramValues, ...JSON.parse(job.parameterValues) };
      } catch {
        // Use defaults
      }
    }

    switch (type) {
      case "scad": {
        if (!job.scadSource) {
          return NextResponse.json(
            { error: "SCAD source not available for this job" },
            { status: 404 }
          );
        }
        return new Response(job.scadSource, {
          headers: {
            "Content-Type": "text/plain",
            "Content-Disposition": `attachment; filename="job_${id}.scad"`,
          },
        });
      }

      case "stl": {
        const stlBuffer = generateMockStlContent(
          paramValues.width ?? 40,
          paramValues.depth ?? 30,
          paramValues.height ?? 15
        );
        return new Response(stlBuffer, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="job_${id}.stl"`,
            "Content-Length": stlBuffer.length.toString(),
          },
        });
      }

      case "png": {
        const pngBuffer = generateMockPngContent();
        return new Response(pngBuffer, {
          headers: {
            "Content-Type": "image/png",
            "Content-Disposition": `attachment; filename="job_${id}.png"`,
            "Content-Length": pngBuffer.length.toString(),
          },
        });
      }

      default:
        return NextResponse.json(
          { error: `Unsupported artifact type: ${type}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("Error fetching artifact:", error);
    return NextResponse.json(
      { error: "Failed to fetch artifact" },
      { status: 500 }
    );
  }
}
