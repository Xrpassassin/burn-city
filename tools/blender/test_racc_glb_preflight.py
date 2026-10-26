"""Standard-library regression tests for the RACC GLB preflight checker.

Run: python3 -m unittest tools/blender/test_racc_glb_preflight.py
No Blender installation required.
"""
import json
from pathlib import Path
import struct
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parent))
from racc_glb_preflight import REQUIRED,inspect

def glb(document, declared_length=None, truncate_json=0):
    raw=json.dumps(document,separators=(",",":")).encode("utf-8")
    raw+=b" " * ((-len(raw)) % 4)
    payload=raw[:-truncate_json] if truncate_json else raw
    length=20+len(payload) if declared_length is None else declared_length
    return (struct.pack("<4sII",b"glTF",2,length)
            +struct.pack("<I4s",len(raw),b"JSON")+payload)

def document(names):
    return {"asset":{"version":"2.0"},"meshes":[{"primitives":[]}],
            "nodes":[{"name":name,"mesh":0} for name in names]}

class RaccGlbPreflightTests(unittest.TestCase):
    def inspect_bytes(self,data):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/"test.glb"
            path.write_bytes(data)
            return inspect(path)

    def test_complete_anatomy(self):
        result=self.inspect_bytes(glb(document(sorted(REQUIRED))))
        self.assertTrue(result["pass"])
        self.assertEqual(result["missingBodyNodes"],[])

    def test_missing_anatomy(self):
        result=self.inspect_bytes(glb(document(sorted(REQUIRED-{"Head_Base"}))))
        self.assertFalse(result["pass"])
        self.assertEqual(result["missingBodyNodes"],["Head_Base"])

    def test_duplicate_anatomy(self):
        result=self.inspect_bytes(glb(document(sorted(REQUIRED)+["Head_Base"])))
        self.assertFalse(result["pass"])
        self.assertEqual(result["duplicateBodyNodes"],["Head_Base"])

    def test_truncated_json(self):
        data=glb(document(sorted(REQUIRED)),truncate_json=4)
        with self.assertRaises(ValueError):
            self.inspect_bytes(data)

    def test_bad_declared_length(self):
        data=glb(document(sorted(REQUIRED)),declared_length=99999)
        with self.assertRaises(ValueError):
            self.inspect_bytes(data)

    def test_invalid_magic(self):
        data=b"BAD!"+glb(document(sorted(REQUIRED)))[4:]
        with self.assertRaises(ValueError):
            self.inspect_bytes(data)

    def test_boolean_mesh_index_not_accepted(self):
        doc=document(sorted(REQUIRED))
        doc["nodes"][0]["mesh"]=True
        result=self.inspect_bytes(glb(doc))
        self.assertFalse(result["pass"])

if __name__=="__main__":
    unittest.main()
