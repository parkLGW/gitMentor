// Simple event emitter for cross-component communication
type EventHandler = (...args: any[]) => void

class EventEmitter {
  private events: Map<string, EventHandler[]> = new Map()

  on(event: string, handler: EventHandler): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, [])
    }
    this.events.get(event)!.push(handler)

    // Return unsubscribe function
    return () => {
      const handlers = this.events.get(event)
      if (handlers) {
        const index = handlers.indexOf(handler)
        if (index > -1) {
          handlers.splice(index, 1)
        }
      }
    }
  }

  emit(event: string, ...args: any[]): void {
    const handlers = this.events.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(...args)
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error)
        }
      })
    }
  }

  off(event: string, handler: EventHandler): void {
    const handlers = this.events.get(event)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }
}

// Global event emitter instance
export const eventBus = new EventEmitter()

// Event names
export const EVENTS = {
  LLM_CONFIG_CHANGED: 'llm:config_changed',
  LLM_CONFIG_CLEARED: 'llm:config_cleared',
} as const
