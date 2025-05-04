/// <reference types="cypress" />
import 'cypress-file-upload';

describe('Cross-Platform Compatibility', () => {
  beforeEach(() => {
    cy.visit('/');
  });

  it('handles different operating systems', () => {
    const platforms = ['win32', 'darwin', 'linux'];
    
    platforms.forEach(platform => {
      cy.window().then(win => {
        Object.defineProperty(win.navigator, 'platform', {
          value: platform,
          writable: true
        });
      });

      cy.get('[data-testid="file-input"]').attachFile('test.jpg');
      cy.get('[role="progressbar"]').should('be.visible');
    });
  });

  it('handles different screen sizes', () => {
    const viewports = [
      { width: 320, height: 568 },  // Mobile
      { width: 768, height: 1024 }, // Tablet
      { width: 1366, height: 768 }, // Desktop
      { width: 1920, height: 1080 } // Large Desktop
    ];

    viewports.forEach(viewport => {
      cy.viewport(viewport.width, viewport.height);
      
      // Test responsive layout
      cy.get('[data-testid="file-input"]').should('be.visible');
      cy.get('[data-testid="drop-zone"]').should('be.visible');
      
      // Test file upload
      cy.get('[data-testid="file-input"]').attachFile('test.jpg');
      cy.get('[role="progressbar"]').should('be.visible');
    });
  });

  it('handles different input methods', () => {
    // Test touch events
    cy.get('[data-testid="file-input"]')
      .trigger('touchstart', { touches: [{ clientX: 0, clientY: 0 }] })
      .trigger('touchend');

    // Test mouse events
    cy.get('[data-testid="file-input"]')
      .trigger('mousedown')
      .trigger('mouseup');

    // Test keyboard events
    cy.get('[data-testid="file-input"]')
      .focus()
      .type('{enter}');
  });

  it('handles different file system paths', () => {
    const paths = [
      'C:\\Users\\Test\\Documents\\test.jpg',  // Windows
      '/Users/Test/Documents/test.jpg',         // macOS
      '/home/test/Documents/test.jpg'           // Linux
    ];

    paths.forEach(path => {
      cy.get('[data-testid="file-input"]')
        .attachFile({ filePath: path });
      
      cy.contains('test.jpg').should('be.visible');
    });
  });
}); 