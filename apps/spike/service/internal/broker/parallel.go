package broker

import (
	"context"
	"sync"
)

// RunParallel executes fn for each id with bounded parallelism.
func RunParallel(ctx context.Context, ids []string, maxParallel int, fn func(id string) error) error {
	if len(ids) == 0 {
		return nil
	}
	if maxParallel <= 0 || maxParallel > len(ids) {
		maxParallel = len(ids)
	}

	jobs := make(chan string)
	errCh := make(chan error, 1)
	var wg sync.WaitGroup

	worker := func() {
		defer wg.Done()
		for id := range jobs {
			select {
			case <-ctx.Done():
				return
			default:
			}
			if err := fn(id); err != nil {
				select {
				case errCh <- err:
				default:
				}
				return
			}
		}
	}

	for i := 0; i < maxParallel; i++ {
		wg.Add(1)
		go worker()
	}

	for _, id := range ids {
		select {
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			return ctx.Err()
		case err := <-errCh:
			close(jobs)
			wg.Wait()
			return err
		case jobs <- id:
		}
	}
	close(jobs)
	wg.Wait()
	select {
	case err := <-errCh:
		return err
	default:
		return nil
	}
}
