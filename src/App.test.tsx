import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';
import { expectNoA11yViolations } from './test/a11y';

describe('App', () => {
  it('renders the product name', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { level: 1, name: /wealth & life planning simulator/i }),
    ).toBeInTheDocument();
  });

  it('states the privacy posture on the page itself', () => {
    render(<App />);
    expect(screen.getByText(/nothing leaves this device/i)).toBeInTheDocument();
  });

  it('renders engine output through the money formatter', () => {
    render(<App />);
    expect(screen.getByTestId('money-sample')).toHaveTextContent('₹1.5Cr');
  });

  it('has no detectable accessibility violations', async () => {
    const { container } = render(<App />);
    await expectNoA11yViolations(container);
  });
});
