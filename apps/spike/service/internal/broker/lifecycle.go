package broker

import (
	"fmt"
)

// SpawnAgent creates a new child agent and links it to its parent
func (b *Broker) SpawnAgent(role AgentRole, scope string, parentID string) (string, error) {
	// Register the new agent
	agentID, err := b.RegisterAgent(role, scope)
	if err != nil {
		return "", err
	}

	// If there's a parent, link them
	if parentID != "" {
		if err := b.linkParentChild(parentID, agentID); err != nil {
			return "", fmt.Errorf("failed to link parent-child: %w", err)
		}
	}

	return agentID, nil
}

// linkParentChild establishes parent-child relationship
func (b *Broker) linkParentChild(parentID, childID string) error {
	// Update parent
	parent, err := b.store.GetAgent(parentID)
	if err != nil {
		return fmt.Errorf("parent agent not found: %w", err)
	}

	parent.ChildIDs = append(parent.ChildIDs, childID)

	if err := b.store.PutAgent(parent); err != nil {
		return fmt.Errorf("failed to update parent: %w", err)
	}

	// Update child
	child, err := b.store.GetAgent(childID)
	if err != nil {
		return fmt.Errorf("child agent not found: %w", err)
	}

	child.ParentID = parentID

	if err := b.store.PutAgent(child); err != nil {
		return fmt.Errorf("failed to update child: %w", err)
	}

	return nil
}

// TerminateAgent marks an agent as complete and cleans up its resources
func (b *Broker) TerminateAgent(agentID string) error {
	agent, err := b.store.GetAgent(agentID)
	if err != nil {
		return fmt.Errorf("agent not found: %w", err)
	}

	// Mark as complete if not already failed
	if agent.Status != StatusFailed {
		if err := b.UpdateStatus(agentID, StatusComplete); err != nil {
			return err
		}
	}

	// Optionally clean up messages (keep for now for debugging/audit)
	// Can add a separate cleanup command later

	return nil
}

// GetChildren returns all child agents of the specified parent
func (b *Broker) GetChildren(parentID string) ([]*Agent, error) {
	parent, err := b.store.GetAgent(parentID)
	if err != nil {
		return nil, fmt.Errorf("parent agent not found: %w", err)
	}

	children := make([]*Agent, 0, len(parent.ChildIDs))
	for _, childID := range parent.ChildIDs {
		child, err := b.store.GetAgent(childID)
		if err != nil {
			// Skip children that don't exist (shouldn't happen but handle gracefully)
			continue
		}
		children = append(children, child)
	}

	return children, nil
}

// GetAgentsByRole returns all agents with the specified role
func (b *Broker) GetAgentsByRole(role AgentRole) ([]*Agent, error) {
	agentStore, err := b.store.LoadAgents()
	if err != nil {
		return nil, err
	}

	agents := []*Agent{}
	for _, agent := range agentStore.Agents {
		if agent.Role == role {
			agents = append(agents, agent)
		}
	}

	return agents, nil
}

// GetAgentsByStatus returns all agents with the specified status
func (b *Broker) GetAgentsByStatus(status AgentStatus) ([]*Agent, error) {
	agentStore, err := b.store.LoadAgents()
	if err != nil {
		return nil, err
	}

	agents := []*Agent{}
	for _, agent := range agentStore.Agents {
		if agent.Status == status {
			agents = append(agents, agent)
		}
	}

	return agents, nil
}

// SuspendAgent pauses an agent for later reactivation
func (b *Broker) SuspendAgent(agentID string) error {
	return b.UpdateStatus(agentID, StatusSuspended)
}

// ResumeAgent reactivates a suspended agent
func (b *Broker) ResumeAgent(agentID string) error {
	agent, err := b.store.GetAgent(agentID)
	if err != nil {
		return fmt.Errorf("agent not found: %w", err)
	}

	if agent.Status != StatusSuspended {
		return fmt.Errorf("agent is not suspended (current status: %s)", agent.Status)
	}

	return b.UpdateStatus(agentID, StatusRunning)
}

// GetAgentTree returns a tree of agents starting from the root
// Returns map of agentID -> agent, with parent-child relationships intact
func (b *Broker) GetAgentTree(rootID string) (map[string]*Agent, error) {
	tree := make(map[string]*Agent)

	var traverse func(string) error
	traverse = func(agentID string) error {
		agent, err := b.store.GetAgent(agentID)
		if err != nil {
			return err
		}

		tree[agentID] = agent

		// Recursively traverse children
		for _, childID := range agent.ChildIDs {
			if err := traverse(childID); err != nil {
				return err
			}
		}

		return nil
	}

	if err := traverse(rootID); err != nil {
		return nil, err
	}

	return tree, nil
}

// CountAgentsByStatus returns counts of agents in each status
func (b *Broker) CountAgentsByStatus() (map[AgentStatus]int, error) {
	agentStore, err := b.store.LoadAgents()
	if err != nil {
		return nil, err
	}

	counts := make(map[AgentStatus]int)
	for _, agent := range agentStore.Agents {
		counts[agent.Status]++
	}

	return counts, nil
}

// CleanupCompletedAgents removes agents that have been complete for a while
// This is a utility for maintenance - removes agent data and messages
func (b *Broker) CleanupCompletedAgents() (int, error) {
	agentStore, err := b.store.LoadAgents()
	if err != nil {
		return 0, err
	}

	cleaned := 0
	for id, agent := range agentStore.Agents {
		// Only clean up agents that have been complete/failed for a while
		if (agent.Status == StatusComplete || agent.Status == StatusFailed) && !agent.FinishedAt.IsZero() {
			// Delete messages
			if err := b.store.DeleteMessages(id); err != nil {
				// Log but don't fail
				continue
			}

			// Delete agent
			delete(agentStore.Agents, id)
			cleaned++
		}
	}

	if cleaned > 0 {
		if err := b.store.SaveAgents(agentStore); err != nil {
			return 0, fmt.Errorf("failed to save agents after cleanup: %w", err)
		}
	}

	return cleaned, nil
}
