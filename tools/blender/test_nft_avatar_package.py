"""No-Blender regression tests for NFT avatar package integrity."""
import sys
import tempfile
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from nft_avatar_package import build_manifest,verify_manifest

class PackageTests(unittest.TestCase):
    def test_round_trip_and_tamper(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/"racc.glb").write_bytes(b"glb-content")
            manifest=build_manifest("racc","0.1.0",root,[{"path":"racc.glb","role":"model"}])
            self.assertTrue(verify_manifest(manifest,root))
            (root/"racc.glb").write_bytes(b"tampered")
            with self.assertRaises(ValueError):
                verify_manifest(manifest,root)

    def test_reject_parent_traversal(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            with self.assertRaises(ValueError):
                build_manifest("racc","0.1.0",root,[{"path":"../outside.glb","role":"model"}])

    def test_reject_duplicate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/"racc.glb").write_bytes(b"model")
            entry={"path":"racc.glb","role":"model"}
            with self.assertRaises(ValueError):
                build_manifest("racc","0.1.0",root,[entry,entry])

    def test_requires_model(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/"idle.glb").write_bytes(b"animation")
            with self.assertRaises(ValueError):
                build_manifest("racc","0.1.0",root,[{"path":"idle.glb","role":"animation"}])

if __name__=="__main__":
    unittest.main()
