# Synthetic rank vectors from the draw_group.py v3 ranking (lines 124-146), lifted unchanged:
#   sorted(ids, key=lambda k: hashlib.sha256(bytes.fromhex(seed) + k.encode()).hexdigest())
# Synthetic ids and randomness only; no receipt is read.
import hashlib, json
vectors = []
for n, label in [(3, "a"), (10, "b"), (25, "c")]:
    ids = sorted("e_" + hashlib.sha256(f"synthetic-{label}-{i}".encode()).hexdigest()[:16] for i in range(n))
    seed = hashlib.sha256(f"seed-{label}".encode()).hexdigest()
    ranked = sorted(ids, key=lambda k: hashlib.sha256(bytes.fromhex(seed) + k.encode()).hexdigest())
    vectors.append({"randomness": seed, "ids": ids, "ranked": ranked,
                    "winners": ranked[:min(10, len(ranked))], "alternates": ranked[10:20],
                    "entry_list_sha256": hashlib.sha256("\n".join(ids).encode()).hexdigest()})
print(json.dumps(vectors, indent=1))
