describe('Basic Tests', () => {
  test('Jest is working correctly', () => {
    expect(2 + 2).toBe(4);
  });

  test('Mocks are working', () => {
    const mockFn = jest.fn();
    mockFn('test');
    expect(mockFn).toHaveBeenCalledWith('test');
  });

  test('Async operations work', async () => {
    const promise = Promise.resolve('success');
    const result = await promise;
    expect(result).toBe('success');
  });
});