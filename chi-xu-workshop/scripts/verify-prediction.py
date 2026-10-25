#!/usr/bin/env python3
import argparse,json,zipfile,struct,hashlib
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
parser=argparse.ArgumentParser(description='Read-only geometry verification of a CLIK-Diffusion results ZIP against the original case. Requires numpy and scipy; no model or GPU.')
parser.add_argument('--archive',required=True)
parser.add_argument('--report',default='docs/PREDICTION_VERIFICATION.json')
args=parser.parse_args()
root=Path(__file__).resolve().parent.parent
z=zipfile.ZipFile(args.archive)
m=json.loads((root/'public/cases/initial/manifest.json').read_text())
matrices=json.loads(z.read('transformation.json'));report=[]
for tooth in m['teeth']:
 id=tooth['mesh_id'];M=np.array(matrices['Tooth-'+id]);R=M[:3,:3];t=M[:3,3]
 raw=(root/'public/cases/initial'/tooth['mesh_uri']).read_bytes();n=struct.unpack_from('<I',raw,80)[0]
 facets=np.frombuffer(raw,offset=84,count=n,dtype=np.dtype([('normal','<f4',(3,)),('v','<f4',(3,3)),('attr','<u2')]))
 original,original_index=np.unique(facets['v'].reshape(-1,3),axis=0,return_inverse=True)
 original=original.astype(float)
 assert hashlib.sha256(raw).hexdigest()==tooth['checksum'], 'source checksum mismatch'
 assert np.isfinite(M).all(), 'non-finite matrix'
 ply=z.read(id+'.ply');offset=ply.index(b'end_header\n')+len(b'end_header\n');header=ply[:offset].decode();nv=int(header.split('element vertex ')[1].split()[0]);nf=int(header.split('element face ')[1].split()[0])
 assert 'property float x\nproperty float y\nproperty float z' in header
 verts=np.frombuffer(ply,offset=offset,count=nv*3,dtype='<f4').reshape(-1,3).astype(float)
 transformed=original@R.T+t
 error,mapping=cKDTree(transformed).query(verts);reverse=cKDTree(verts).query(transformed)[0]
 face_records=np.frombuffer(ply,offset=offset+nv*12,count=nf,dtype=np.dtype([('count','u1'),('indices','<i4',(3,))]))
 assert np.all(face_records['count']==3) and face_records['indices'].min()>=0 and face_records['indices'].max()<nv, 'invalid triangles'
 faces=np.sort(mapping[face_records['indices']],axis=1);source_faces=np.sort(original_index.reshape(-1,3),axis=1)
 canonical=lambda rows: rows[np.lexsort((rows[:,2],rows[:,1],rows[:,0]))]
 topology_equal=np.array_equal(canonical(faces),canonical(source_faces))
 row={'id':id,'source_sha256':tooth['checksum'],'prediction_mesh_sha256':hashlib.sha256(ply).hexdigest(),'triangle_vertex_sets_equal':bool(topology_equal),'det':float(np.linalg.det(R)),'orthogonal_error':float(np.max(np.abs(R.T@R-np.eye(3)))),'homogeneous_error':float(np.max(np.abs(M[3]-[0,0,0,1]))),'vertices_original':len(original),'vertices_output':nv,'faces_original':n,'faces_output':nf,'max_surface_vertex_error':float(max(error.max(),reverse.max())),'rms_vertex_error':float(np.sqrt(np.mean(error**2))),'rotation_degrees':float(np.degrees(np.arccos(np.clip((np.trace(R)-1)/2,-1,1)))),'pivot_displacement':float(np.linalg.norm(R@np.array(m['prepared_assets'][id]['pivot'])+t-np.array(m['prepared_assets'][id]['pivot'])))}
 report.append(row)
assert len(matrices)==len(report)==28
summary={'matches_original_case':all(r['triangle_vertex_sets_equal'] and r['vertices_original']==r['vertices_output'] and r['max_surface_vertex_error']<1e-4 and r['faces_original']==r['faces_output'] and abs(r['det']-1)<1e-8 and r['orthogonal_error']<1e-8 and r['homogeneous_error']<1e-10 for r in report),'teeth':len(report),'max_vertex_error':max(r['max_surface_vertex_error'] for r in report),'max_rotation':max(r['rotation_degrees'] for r in report),'max_pivot_displacement':max(r['pivot_displacement'] for r in report),'meshes':report,'archive_sha256':hashlib.sha256(Path(args.archive).read_bytes()).hexdigest()}
assert summary['matches_original_case'], 'reference did not pass source-geometry verification'
summary['clinical_alignment_validated']=False
summary['limits']='Rigid transforms, original geometry and topology verified. No clinical alignment, contact, penetration or occlusion validation.'
(root/args.report).write_text(json.dumps(summary,indent=2)+'\n')
print(json.dumps({k:v for k,v in summary.items() if k!='meshes'},indent=2))
