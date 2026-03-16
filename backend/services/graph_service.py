import networkx as nx
from database.models import ConceptNode, KnowledgeEdge, NodeState
from beanie import PydanticObjectId


async def build_networkx_graph(user_id: PydanticObjectId) -> nx.DiGraph:
    """Build a NetworkX directed graph from the user's knowledge edges."""
    nodes = await ConceptNode.find(ConceptNode.user_id == user_id).to_list()
    edges = await KnowledgeEdge.find(KnowledgeEdge.user_id == user_id).to_list()

    G = nx.DiGraph()
    for node in nodes:
        G.add_node(
            str(node.id),
            concept=node.concept,
            state=node.state.value,
            retention=node.retention_rt,
            tier=node.complexity_tier,
        )

    for edge in edges:
        G.add_edge(str(edge.from_node_id), str(edge.to_node_id), type=edge.edge_type)

    return G


async def get_dependency_depth(user_id: PydanticObjectId, node_id: str) -> int:
    """Compute how many prerequisite hops from a root node."""
    G = await build_networkx_graph(user_id)
    roots = [n for n in G.nodes() if G.in_degree(n) == 0]
    if not roots or node_id not in G:
        return 0

    min_depth = float("inf")
    for root in roots:
        try:
            path_len = nx.shortest_path_length(G, root, node_id)
            min_depth = min(min_depth, path_len)
        except nx.NetworkXNoPath:
            continue

    return int(min_depth) if min_depth != float("inf") else 0


async def get_related_nodes(
    user_id: PydanticObjectId, node_id: str, max_hops: int = 2
) -> list[str]:
    """Find nodes within N hops of the given node."""
    G = await build_networkx_graph(user_id)
    if node_id not in G:
        return []

    related = set()
    undirected = G.to_undirected()
    for target in undirected.nodes():
        if target == node_id:
            continue
        try:
            length = nx.shortest_path_length(undirected, node_id, target)
            if length <= max_hops:
                related.add(target)
        except nx.NetworkXNoPath:
            continue

    return list(related)


async def get_learning_path_progress(user_id: PydanticObjectId) -> dict:
    """Compute overall learning path progress."""
    nodes = await ConceptNode.find(ConceptNode.user_id == user_id).to_list()
    if not nodes:
        return {"total": 0, "mastered": 0, "in_progress": 0, "not_started": 0, "fading": 0}

    mastered = sum(1 for n in nodes if n.state == NodeState.GREEN)
    in_progress = sum(1 for n in nodes if n.state == NodeState.YELLOW)
    fading = sum(1 for n in nodes if n.state == NodeState.FADING)
    not_started = sum(1 for n in nodes if n.state == NodeState.RED)

    return {
        "total": len(nodes),
        "mastered": mastered,
        "in_progress": in_progress,
        "not_started": not_started,
        "fading": fading,
        "mastery_pct": round(mastered / len(nodes) * 100, 1),
    }
